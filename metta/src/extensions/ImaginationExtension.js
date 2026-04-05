/**
 * ImaginationExtension.js - MeTTa Extension for an Internal Mind's Eye / Imagination Canvas
 * Provides a high-level API to draw images and record key-framed video (GIF) sequences.
 */
import { Term, sym, isGrounded, grounded } from '../kernel/Term.js';
import { Logger } from '@senars/core';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import GIFEncoder from 'gifencoder';
import fs from 'fs';

export class ImaginationExtension {
    constructor(interpreter, agent = null) {
        this.interpreter = interpreter;
        this.agent = agent;
        this.ground = interpreter.ground;
    }

    register() {
        // Core primitives that return wrapped JS objects
        this.ground.register('&canvas-create', this._canvasCreate.bind(this));
        this.ground.register('&canvas-to-buffer', this._canvasToBuffer.bind(this));
        this.ground.register('&video-encoder-create', this._videoEncoderCreate.bind(this));
        this.ground.register('&fs-write-sync', this._fsWriteSync.bind(this));
        this.ground.register('&fs-create-write-stream', this._fsCreateWriteStream.bind(this));

        Logger.info('Imagination (Mind Eye) primitives registered in MeTTa.');
    }

    _unwrapVal(atom) {
        if (!atom) {return null;}
        if (isGrounded(atom)) {return atom.value;}
        if (atom.type === 'atom') {
            const num = Number(atom.name);
            if (!isNaN(num)) {return num;}

            // Strip quotes
            const {name} = atom;
            if (typeof name === 'string' && name.startsWith('"') && name.endsWith('"')) {
                return name.slice(1, -1);
            }
            return name;
        }
        return atom;
    }

    _canvasCreate(widthAtom, heightAtom) {
        const width = this._unwrapVal(widthAtom);
        const height = this._unwrapVal(heightAtom);
        const canvas = createCanvas(width, height);

        // Return wrapped instance directly
        return grounded(canvas);
    }

    _canvasToBuffer(canvasAtom) {
        const canvas = this._unwrapVal(canvasAtom);
        if (!canvas || typeof canvas.toBuffer !== 'function') {return sym('False');}

        // Returns the node buffer
        return grounded(canvas.toBuffer('image/png'));
    }

    _videoEncoderCreate(widthAtom, heightAtom) {
        const width = this._unwrapVal(widthAtom);
        const height = this._unwrapVal(heightAtom);
        const encoder = new GIFEncoder(width, height);

        // To work smoothly with JS reflection streams and pipes, it's easier to expose a unified start method
        encoder._startRecording = function(filename, delay = 500, repeat = 0) {
            const stream = fs.createWriteStream(filename);
            this.createReadStream().pipe(stream);
            this.start();
            this.setRepeat(repeat);
            this.setDelay(delay);
            this.setQuality(10);
            this._outStream = stream;
            return sym('True');
        };

        const originalFinish = encoder.finish.bind(encoder);
        encoder.finish = function() {
            originalFinish();
            // Let the pipeline automatically end the stream instead of ending it manually.
            return sym('True');
        };

        // Helper to simplify wrapping
        const canvasMap = new WeakMap();

        const originalAddFrame = encoder.addFrame.bind(encoder);
        encoder._addFrame = function(ctx) {
            let actualCtx = ctx;
            if (ctx && typeof ctx === 'object' && 'value' in ctx) {
                 actualCtx = ctx.value;
            }
            try {
                originalAddFrame(actualCtx);
            } catch (e) {
                Logger.error("Error in addFrame:", e);
            }
            return sym('True');
        };

        // Return wrapped instance directly
        return grounded(encoder);
    }

    _fsWriteSync(filenameAtom, bufferAtom) {
        const filename = this._unwrapVal(filenameAtom);
        const buffer = this._unwrapVal(bufferAtom);
        if (!filename || !buffer) {return sym('False');}

        fs.writeFileSync(filename, buffer);
        Logger.info(`[Imagination] Wrote file to ${filename}`);
        return sym('True');
    }

    _fsCreateWriteStream(filenameAtom) {
        const filename = this._unwrapVal(filenameAtom);
        if (!filename) {return sym('False');}

        const stream = fs.createWriteStream(filename);
        return grounded(stream);
    }
}
