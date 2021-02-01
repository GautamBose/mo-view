/* @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var _a, _b;
import { EventDispatcher } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CacheEvictionPolicy } from '../utilities/cache-eviction-policy.js';
/**
 * A helper to Promise-ify a Three.js GLTFLoader
 */
export const loadWithLoader = (url, loader, progressCallback = () => { }) => {
    const onProgress = (event) => {
        const fraction = event.loaded / event.total;
        progressCallback(Math.max(0, Math.min(1, isFinite(fraction) ? fraction : 1)));
    };
    return new Promise((resolve, reject) => {
        loader.load(url, resolve, onProgress, reject);
    });
};
const cache = new Map();
const preloaded = new Map();
let dracoDecoderLocation;
const dracoLoader = new DRACOLoader();
export const $loader = Symbol('loader');
export const $evictionPolicy = Symbol('evictionPolicy');
const $GLTFInstance = Symbol('GLTFInstance');
export class CachingGLTFLoader extends EventDispatcher {
    constructor(GLTFInstance) {
        super();
        this[_b] = new GLTFLoader();
        this[$GLTFInstance] = GLTFInstance;
        this[$loader].setDRACOLoader(dracoLoader);
    }
    static setDRACODecoderLocation(url) {
        dracoDecoderLocation = url;
        dracoLoader.setDecoderPath(url);
    }
    static getDRACODecoderLocation() {
        return dracoDecoderLocation;
    }
    static get cache() {
        return cache;
    }
    /** @nocollapse */
    static clearCache() {
        cache.forEach((_value, url) => {
            this.delete(url);
        });
        this[$evictionPolicy].reset();
    }
    static has(url) {
        return cache.has(url);
    }
    /** @nocollapse */
    static async delete(url) {
        if (!this.has(url)) {
            return;
        }
        const gltfLoads = cache.get(url);
        preloaded.delete(url);
        cache.delete(url);
        const gltf = await gltfLoads;
        // Dispose of the cached glTF's materials and geometries:
        gltf.dispose();
    }
    /**
     * Returns true if the model that corresponds to the specified url is
     * available in our local cache.
     */
    static hasFinishedLoading(url) {
        return !!preloaded.get(url);
    }
    get [(_a = $evictionPolicy, _b = $loader, $evictionPolicy)]() {
        return this.constructor[$evictionPolicy];
    }
    /**
     * Preloads a glTF, populating the cache. Returns a promise that resolves
     * when the cache is populated.
     */
    async preload(url, element, progressCallback = () => { }) {
        this.dispatchEvent({ type: 'preload', element: element, src: url });
        if (!cache.has(url)) {
            const rawGLTFLoads = loadWithLoader(url, this[$loader], (progress) => {
                progressCallback(progress * 0.8);
            });
            const GLTFInstance = this[$GLTFInstance];
            const gltfInstanceLoads = rawGLTFLoads
                .then((rawGLTF) => {
                return GLTFInstance.prepare(rawGLTF);
            })
                .then((preparedGLTF) => {
                progressCallback(0.9);
                return new GLTFInstance(preparedGLTF);
            });
            cache.set(url, gltfInstanceLoads);
        }
        await cache.get(url);
        preloaded.set(url, true);
        if (progressCallback) {
            progressCallback(1.0);
        }
    }
    /**
     * Loads a glTF from the specified url and resolves a unique clone of the
     * glTF. If the glTF has already been loaded, makes a clone of the cached
     * copy.
     */
    async load(url, element, progressCallback = () => { }) {
        await this.preload(url, element, progressCallback);
        const gltf = await cache.get(url);
        const clone = await gltf.clone();
        this[$evictionPolicy].retain(url);
        // Patch dispose so that we can properly account for instance use
        // in the caching layer:
        clone.dispose = (() => {
            const originalDispose = clone.dispose;
            let disposed = false;
            return () => {
                if (disposed) {
                    return;
                }
                disposed = true;
                originalDispose.apply(clone);
                this[$evictionPolicy].release(url);
            };
        })();
        return clone;
    }
}
CachingGLTFLoader[_a] = new CacheEvictionPolicy(CachingGLTFLoader);
//# sourceMappingURL=CachingGLTFLoader.js.map