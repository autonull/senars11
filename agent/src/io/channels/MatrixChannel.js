import {Embodiment} from '../Embodiment.js';
import {Logger} from '@senars/core';

export class MatrixChannel extends Embodiment {
    constructor(config = {}) {
        super({
            ...config,
            name: config.name || 'Matrix',
            description: config.description || 'Matrix protocol channel',
            capabilities: config.capabilities || ['private-messages', 'rooms', 'typing-indicators', 'read-receipts'],
            constraints: {maxMessageLength: 65536},
            isPublic: config.isPublic ?? false,
            isInternal: false,
            defaultSalience: config.defaultSalience ?? 0.5
        });
        this.type = 'matrix';
        this.client = null;
        this.matrixSdk = null;
        this.joinedRooms = new Set();
        this.pendingInvites = new Set();
    }

    async _loadSdk() {
        try {
            this.matrixSdk = await import('matrix-js-sdk');
            return true;
        } catch (error) {
            Logger.error('Matrix SDK not available. Install matrix-js-sdk:', error);
            return false;
        }
    }

    _setupClientEvents() {
        if (!this.client) {
            return;
        }

        // Sync completed
        this.client.on('sync', (state, prevState, data) => {
            switch (state) {
                case 'PREPARED':
                    Logger.info(`[Matrix:${this.id}] Connected and synced`);
                    this.setStatus('connected');
                    this.emit('connected', {userId: this.client.getUserId()});

                    // Auto-join configured rooms
                    if (this.config.rooms) {
                        this.config.rooms.forEach(room => this.joinRoom(room));
                    }
                    break;

                case 'SYNCING':
                    Logger.debug(`[Matrix:${this.id}] Syncing...`);
                    break;

                case 'ERROR':
                    Logger.error(`[Matrix:${this.id}] Sync error:`, data?.error);
                    this.setStatus('error');
                    this.emit('error', data?.error);
                    break;

                case 'RECONNECTING':
                    Logger.warn(`[Matrix:${this.id}] Reconnecting...`);
                    this.setStatus('connecting');
                    break;

                case 'STOPPED':
                    Logger.info(`[Matrix:${this.id}] Stopped`);
                    this.setStatus('disconnected');
                    break;
            }
        });

        // Room messages
        this.client.on('Room.message', (roomId, event) => {
            if (event.getSender() === this.client.getUserId()) {
                return;
            } // Ignore own messages

            const content = event.getContent();
            const from = event.getSender();
            const room = this.client.getRoom(roomId);
            const roomName = room?.name || roomId;

            // Handle different message types
            const messageType = content.msgtype || 'm.text';
            let textContent = content.body || '';

            // Handle formatted messages
            if (content.formatted_body) {
                textContent = content.formatted_body;
            }

            this.emitMessage({
                from,
                content: textContent,
                metadata: {
                    room: roomName,
                    roomId,
                    type: messageType,
                    eventId: event.getId(),
                    isPrivate: false
                }
            });
        });

        // Room invites
        this.client.on('Room.invite', (roomId, inviteEvent) => {
            const inviter = inviteEvent.getSender();
            Logger.info(`[Matrix:${this.id}] Invited to room ${roomId} by ${inviter}`);
            this.pendingInvites.add(roomId);
            this.emit('invite', {roomId, inviter});

            // Auto-accept invites if configured
            if (this.config.autoAcceptInvites) {
                this.joinRoom(roomId);
            }
        });

        // Room member joins
        this.client.on('RoomMember.membership', (event, member) => {
            if (member.membership === 'join' && member.userId !== this.client.getUserId()) {
                this.emit('user_joined', {
                    userId: member.userId,
                    roomId: member.roomId,
                    name: member.name
                });
            } else if (member.membership === 'leave') {
                this.emit('user_left', {
                    userId: member.userId,
                    roomId: member.roomId,
                    name: member.name,
                    reason: event.getContent().reason
                });
            }
        });

        // Typing indicators
        this.client.on('RoomMember.typing', (event, member) => {
            const isTyping = member.typing;
            this.emit('typing', {
                userId: member.userId,
                roomId: member.roomId,
                isTyping
            });
        });

        // Read receipts
        this.client.on('Room.receipt', (event, room) => {
            this.emit('receipt', {
                roomId: room.roomId,
                event
            });
        });

        // Errors
        this.client.on('error', (err) => {
            Logger.error(`[Matrix:${this.id}] Client error:`, err);
            this.emit('error', err);
        });
    }

    async connect() {
        if (this.status === 'connected') {
            return;
        }

        this.setStatus('connecting');

        // Load SDK if not loaded
        if (!this.matrixSdk) {
            const loaded = await this._loadSdk();
            if (!loaded) {
                this.setStatus('error');
                throw new Error('Matrix SDK not available');
            }
        }

        try {
            const {createClient} = this.matrixSdk;

            this.client = createClient({
                baseUrl: this.config.homeserver || 'https://matrix.org',
                accessToken: this.config.accessToken,
                userId: this.config.userId,
                deviceId: this.config.deviceId || `senars-${Date.now()}`,
                timelineSupport: true,
                cryptoStoreType: 'memory'
            });

            this._setupClientEvents();

            // Start syncing
            this.client.startClient({
                initialSyncLimit: 100
            });

            // Wait for connection
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Matrix connection timeout'));
                }, 30000);

                this.client.once('sync', (state) => {
                    clearTimeout(timeout);
                    if (state === 'PREPARED') {
                        resolve();
                    } else {
                        reject(new Error(`Matrix sync failed: ${state}`));
                    }
                });
            });

        } catch (error) {
            this.setStatus('error');
            throw error;
        }
    }

    async disconnect() {
        if (this.status === 'disconnected') {
            return;
        }

        if (this.client) {
            this.client.stopClient();
            this.client = null;
        }

        this.joinedRooms.clear();
        this.pendingInvites.clear();
        this.setStatus('disconnected');
    }

    async joinRoom(roomIdOrAlias) {
        if (!this.client || this.status !== 'connected') {
            Logger.warn(`[Matrix:${this.id}] Cannot join room - not connected`);
            return;
        }

        try {
            const roomId = await this.client.joinRoom(roomIdOrAlias);
            this.joinedRooms.add(roomId.roomId || roomId);
            Logger.info(`[Matrix:${this.id}] Joined room: ${roomId.roomId || roomId}`);
            return roomId;
        } catch (error) {
            Logger.error(`[Matrix:${this.id}] Failed to join room:`, error);
            throw error;
        }
    }

    async leaveRoom(roomId) {
        if (!this.client) {
            return;
        }

        try {
            await this.client.leave(roomId);
            this.joinedRooms.delete(roomId);
            Logger.info(`[Matrix:${this.id}] Left room: ${roomId}`);
        } catch (error) {
            Logger.error(`[Matrix:${this.id}] Failed to leave room:`, error);
        }
    }

    async sendMessage(target, content, metadata = {}) {
        if (!this.client || this.status !== 'connected') {
            throw new Error('Not connected to Matrix');
        }

        const roomId = this._resolveRoomId(target);
        if (!roomId) {
            throw new Error(`Unknown room: ${target}`);
        }

        const eventType = metadata.type || 'm.text';

        // Handle different message types
        if (metadata.action) {
            // Emote message
            await this.client.sendEmoteMessage(roomId, content);
        } else if (metadata.notice) {
            // Notice message
            await this.client.sendNotice(roomId, content);
        } else {
            // Regular text message
            await this.client.sendTextMessage(roomId, content);
        }

        return true;
    }

    async sendTyping(roomIdOrAlias, typing = true) {
        if (!this.client) {
            return;
        }

        const resolvedRoomId = this._resolveRoomId(roomIdOrAlias);
        if (!resolvedRoomId) {
            return;
        }

        await this.client.sendTyping(resolvedRoomId, typing, typing ? 30000 : 0);
    }

    async sendReadReceipt(roomId, eventId) {
        if (!this.client) {
            return;
        }

        const room = this.client.getRoom(roomId);
        if (!room) {
            return;
        }

        const event = room.getTimeline().find(e => e.getId() === eventId);
        if (event) {
            await this.client.sendReadReceipt(event);
        }
    }

    async getRoomMembers(roomId) {
        if (!this.client) {
            return [];
        }

        const room = this.client.getRoom(this._resolveRoomId(roomId));
        if (!room) {
            return [];
        }

        return room.getJoinedMembers().map(m => ({
            userId: m.userId,
            name: m.name,
            powerLevel: m.powerLevel
        }));
    }

    async getJoinedRooms() {
        if (!this.client) {
            return [];
        }
        return this.client.getJoinedRooms().map(r => r.roomId);
    }

    _resolveRoomId(target) {
        // If it's already a room ID
        if (target.startsWith('!')) {
            return this.joinedRooms.has(target) ? target : null;
        }

        // If it's a room alias
        if (target.startsWith('#')) {
            const room = this.client.getRooms().find(r => {
                const aliases = r.getCanonicalAlias() || r.getAltAliases() || [];
                return aliases.includes(target);
            });
            return room?.roomId;
        }

        // Try to find by name
        const room = this.client.getRooms().find(r => r.name === target);
        return room?.roomId;
    }

    isRoomId(target) {
        return target.startsWith('!');
    }

    isRoomAlias(target) {
        return target.startsWith('#');
    }
}
