import ModelViewerElementBase from '../model-viewer-base.js';
import { ARStatus } from '../three-components/ARRenderer.js';
import { Constructor } from '../utilities.js';
export declare type ARMode = 'quick-look' | 'scene-viewer' | 'webxr' | 'none';
export interface ARStatusDetails {
    status: ARStatus;
}
export declare const $openSceneViewer: unique symbol;
export declare const $openIOSARQuickLook: unique symbol;
export declare interface ARInterface {
    ar: boolean;
    arModes: string;
    arScale: string;
    iosSrc: string | null;
    readonly canActivateAR: boolean;
    activateAR(): Promise<void>;
}
export declare const ARMixin: <T extends Constructor<ModelViewerElementBase, object>>(ModelViewerElement: T) => {
    new (...args: any[]): ARInterface;
    prototype: ARInterface;
} & object & T;
