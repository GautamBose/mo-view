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
import { Matrix4, PerspectiveCamera, Vector2, Vector3 } from 'three';
import ModelViewerElementBase, { $canvas, $renderer } from '../../model-viewer-base.js';
import { ARRenderer } from '../../three-components/ARRenderer.js';
import { SETTLING_TIME } from '../../three-components/Damper.js';
import { ModelScene } from '../../three-components/ModelScene.js';
import { assetPath } from '../helpers.js';
const expect = chai.expect;
class MockXRFrame {
    constructor(session) {
        this.session = session;
    }
    // We don't use nor test the returned XRPose other than its existence.
    getPose(_xrSpace, _frameOfRef) {
        return {};
    }
    getViewerPose(_referenceSpace) {
        // Rotate 180 degrees on Y (so it's not the default)
        // and angle 45 degrees towards the ground, like a phone.
        const matrix = new Matrix4()
            .identity()
            .makeRotationAxis(new Vector3(0, 1, 0), Math.PI)
            .multiply(new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), -Math.PI / 4));
        matrix.setPosition(10, 2, 3);
        const transform = {
            matrix: matrix.elements,
            position: {},
            orientation: {},
            inverse: {}
        };
        const camera = new PerspectiveCamera();
        const view = {
            eye: {},
            projectionMatrix: camera.projectionMatrix.elements,
            viewMatrix: {},
            transform: transform,
            recommendedViewportScale: null,
            requestViewportScale: (_scale) => { }
        };
        const viewerPos = { transform: transform, views: [view] };
        return viewerPos;
    }
    getHitTestResults(_xrHitTestSource) {
        return [];
    }
    getHitTestResultsForTransientInput(_hitTestSource) {
        return [];
    }
}
suite('ARRenderer', () => {
    let nextId = 0;
    let tagName;
    let ModelViewerElement;
    let element;
    let arRenderer;
    let xrSession;
    let inputSources = [];
    const setInputSources = (sources) => {
        inputSources = sources;
    };
    const stubWebXrInterface = (arRenderer) => {
        arRenderer.resolveARSession = async () => {
            class FakeSession extends EventTarget {
                constructor() {
                    super(...arguments);
                    this.renderState = {
                        baseLayer: {
                            getViewport: () => {
                                return { x: 0, y: 0, width: 320, height: 240 };
                            }
                        }
                    };
                    this.hitTestSources = new Set();
                }
                updateRenderState(_object) {
                }
                requestFrameOfReference() {
                    return {};
                }
                async requestReferenceSpace(_type) {
                    return {};
                }
                get inputSources() {
                    return inputSources;
                }
                async requestHitTestSource(_options) {
                    const result = { cancel: () => { } };
                    this.hitTestSources.add(result);
                    return result;
                }
                async requestHitTestSourceForTransientInput(_options) {
                    const result = { cancel: () => { } };
                    this.hitTestSources.add(result);
                    return result;
                }
                requestAnimationFrame() {
                    return 1;
                }
                cancelAnimationFrame() {
                }
                async end() {
                    this.dispatchEvent(new CustomEvent('end'));
                }
            }
            xrSession = new FakeSession();
            return xrSession;
        };
    };
    setup(() => {
        tagName = `model-viewer-arrenderer-${nextId++}`;
        ModelViewerElement = class extends ModelViewerElementBase {
            static get is() {
                return tagName;
            }
        };
        customElements.define(tagName, ModelViewerElement);
        element = new ModelViewerElement();
        arRenderer = new ARRenderer(element[$renderer]);
    });
    teardown(async () => {
        await arRenderer.stopPresenting().catch(() => { });
    });
    // NOTE(cdata): It will be a notable day when this test fails
    test('does not support presenting to AR on any browser', async () => {
        expect(await arRenderer.supportsPresentation()).to.be.equal(false);
    });
    test('is not presenting if present has not been invoked', () => {
        expect(arRenderer.isPresenting).to.be.equal(false);
    });
    suite('when presenting a scene', () => {
        let modelScene;
        let oldXRRay;
        setup(async () => {
            modelScene = new ModelScene({
                element: element,
                canvas: element[$canvas],
                width: 200,
                height: 100,
            });
            await modelScene.setSource(assetPath('models/Astronaut.glb'));
            stubWebXrInterface(arRenderer);
            setInputSources([]);
            oldXRRay = window.XRRay;
            window.XRRay = class MockXRRay {
                constructor(_origin, _direction) {
                    this.origin = new DOMPointReadOnly;
                    this.direction = new DOMPointReadOnly;
                    this.matrix = new Float32Array;
                }
            };
            await arRenderer.present(modelScene);
        });
        teardown(() => {
            window.XRRay = oldXRRay;
        });
        test('presents the model at its natural scale', () => {
            const scale = modelScene.target.getWorldScale(new Vector3());
            expect(scale.x).to.be.equal(1);
            expect(scale.y).to.be.equal(1);
            expect(scale.z).to.be.equal(1);
        });
        suite('presentation ends', () => {
            setup(async () => {
                await arRenderer.stopPresenting();
            });
            test('restores the model to its natural scale', () => {
                const scale = modelScene.target.getWorldScale(new Vector3());
                expect(scale.x).to.be.equal(1);
                expect(scale.y).to.be.equal(1);
                expect(scale.z).to.be.equal(1);
            });
            test('restores original camera', () => {
                expect(modelScene.getCamera()).to.be.equal(modelScene.camera);
            });
            test('restores scene size', () => {
                expect(modelScene.width).to.be.equal(200);
                expect(modelScene.height).to.be.equal(100);
            });
        });
        // We're going to need to mock out XRFrame more so it can set the camera
        // in order to properly test this.
        suite('after initial placement', () => {
            let yaw;
            setup(async () => {
                await arRenderer.present(modelScene);
                arRenderer.onWebXRFrame(0, new MockXRFrame(arRenderer.currentSession));
                yaw = modelScene.yaw;
            });
            test('places the model oriented to the camera', () => {
                const epsilon = 0.0001;
                const { target, position } = modelScene;
                const cameraPosition = arRenderer.camera.position;
                const cameraToHit = new Vector2(position.x - cameraPosition.x, position.z - cameraPosition.z);
                const forward = target.getWorldDirection(new Vector3());
                const forwardProjection = new Vector2(forward.x, forward.z);
                expect(forward.y).to.be.equal(0);
                expect(cameraToHit.cross(forwardProjection)).to.be.closeTo(0, epsilon);
                expect(cameraToHit.dot(forwardProjection)).to.be.lessThan(0);
            });
            suite('after hit placement', () => {
                let hitPosition;
                setup(async () => {
                    hitPosition = new Vector3(5, -1, 1);
                    await arRenderer.placeModel(hitPosition);
                    // Long enough time to settle at new position.
                    arRenderer.onWebXRFrame(SETTLING_TIME, new MockXRFrame(arRenderer.currentSession));
                });
                test('scene has the same orientation', () => {
                    expect(modelScene.yaw).to.be.equal(yaw);
                });
            });
        });
    });
});
//# sourceMappingURL=ARRenderer-spec.js.map