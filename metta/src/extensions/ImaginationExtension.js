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

        // Internal state
        this.canvas = null;
        this.ctx = null;
        this.encoder = null;
        this.width = 0;
        this.height = 0;
    }

    register() {
        this.ground.register('&canvas-create', this._canvasCreate.bind(this));
        this.ground.register('&canvas-clear', this._canvasClear.bind(this));
        this.ground.register('&canvas-draw-rect', this._canvasDrawRect.bind(this));
        this.ground.register('&canvas-draw-circle', this._canvasDrawCircle.bind(this));
        this.ground.register('&canvas-set-color', this._canvasSetColor.bind(this));
        this.ground.register('&canvas-set-font', this._canvasSetFont.bind(this));
        this.ground.register('&canvas-draw-text', this._canvasDrawText.bind(this));
        this.ground.register('&canvas-save-image', this._canvasSaveImage.bind(this));

        this.ground.register('&video-start', this._videoStart.bind(this));
        this.ground.register('&video-add-frame', this._videoAddFrame.bind(this));
        this.ground.register('&video-finish', this._videoFinish.bind(this));

        Logger.info('Imagination (Mind Eye) primitives registered in MeTTa.');
    }

    _unwrapVal(atom) {
        if (!atom) return null;
        if (isGrounded(atom)) return atom.value;
        if (atom.type === 'atom') {
            const num = Number(atom.name);
            if (!isNaN(num)) return num;

            // Strip quotes
            let name = atom.name;
            if (typeof name === 'string' && name.startsWith('"') && name.endsWith('"')) {
                return name.slice(1, -1);
            }
            return name;
        }
        return atom;
    }

    _canvasCreate(widthAtom, heightAtom) {
        this.width = this._unwrapVal(widthAtom);
        this.height = this._unwrapVal(heightAtom);
        this.canvas = createCanvas(this.width, this.height);
        this.ctx = this.canvas.getContext('2d');
        // Default style
        this.ctx.fillStyle = '#000000';
        this.ctx.strokeStyle = '#000000';
        return sym('True');
    }

    _canvasClear() {
        if (!this.ctx) return sym('False');
        this.ctx.clearRect(0, 0, this.width, this.height);
        return sym('True');
    }

    _canvasDrawRect(xAtom, yAtom, wAtom, hAtom, styleAtom) {
        if (!this.ctx) return sym('False');
        const x = this._unwrapVal(xAtom);
        const y = this._unwrapVal(yAtom);
        const w = this._unwrapVal(wAtom);
        const h = this._unwrapVal(hAtom);
        const style = this._unwrapVal(styleAtom) || 'fill'; // 'fill' or 'stroke'

        if (style === 'stroke') {
            this.ctx.strokeRect(x, y, w, h);
        } else {
            this.ctx.fillRect(x, y, w, h);
        }
        return sym('True');
    }

    _canvasDrawCircle(xAtom, yAtom, rAtom, styleAtom) {
        if (!this.ctx) return sym('False');
        const x = this._unwrapVal(xAtom);
        const y = this._unwrapVal(yAtom);
        const r = this._unwrapVal(rAtom);
        const style = this._unwrapVal(styleAtom) || 'fill';

        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, 2 * Math.PI);
        if (style === 'stroke') {
            this.ctx.stroke();
        } else {
            this.ctx.fill();
        }
        return sym('True');
    }

    _canvasSetColor(colorAtom) {
        if (!this.ctx) return sym('False');
        const color = this._unwrapVal(colorAtom);
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = color;
        return sym('True');
    }

    _canvasSetFont(fontAtom) {
        if (!this.ctx) return sym('False');
        const font = this._unwrapVal(fontAtom);
        this.ctx.font = font;
        return sym('True');
    }

    _canvasDrawText(textAtom, xAtom, yAtom, styleAtom) {
        if (!this.ctx) return sym('False');
        const text = this._unwrapVal(textAtom);
        const x = this._unwrapVal(xAtom);
        const y = this._unwrapVal(yAtom);
        const style = this._unwrapVal(styleAtom) || 'fill';

        if (style === 'stroke') {
            this.ctx.strokeText(String(text), x, y);
        } else {
            this.ctx.fillText(String(text), x, y);
        }
        return sym('True');
    }

    _canvasSaveImage(filenameAtom) {
        if (!this.canvas) return sym('False');
        const filename = this._unwrapVal(filenameAtom);

        const buffer = this.canvas.toBuffer('image/png');
        fs.writeFileSync(filename, buffer);
        Logger.info(`[Imagination] Saved image to ${filename}`);
        return sym('True');
    }

    _videoStart(filenameAtom, delayAtom, repeatAtom) {
        if (!this.canvas) return sym('False');
        const filename = this._unwrapVal(filenameAtom);
        const delay = this._unwrapVal(delayAtom) || 500; // ms
        const repeat = this._unwrapVal(repeatAtom) !== undefined ? this._unwrapVal(repeatAtom) : 0; // 0 = loop forever

        this.encoder = new GIFEncoder(this.width, this.height);
        this.encoder.createReadStream().pipe(fs.createWriteStream(filename));
        this.encoder.start();
        this.encoder.setRepeat(repeat);
        this.encoder.setDelay(delay);
        this.encoder.setQuality(10);

        Logger.info(`[Imagination] Started recording video to ${filename}`);
        return sym('True');
    }

    _videoAddFrame() {
        if (!this.encoder || !this.ctx) return sym('False');
        this.encoder.addFrame(this.ctx);
        return sym('True');
    }

    _videoFinish() {
        if (!this.encoder) return sym('False');
        this.encoder.finish();
        this.encoder = null;
        Logger.info('[Imagination] Finished recording video');
        return sym('True');
    }
}
