const $threeGLTF = Symbol('threeGLTF');
const $gltf = Symbol('gltf');
const $gltfElementMap = Symbol('gltfElementMap');
const $threeObjectMap = Symbol('threeObjectMap');
const $parallelTraverseThreeScene = Symbol('parallelTraverseThreeScene');
const $correlateOriginalThreeGLTF = Symbol('correlateOriginalThreeGLTF');
const $correlateCloneThreeGLTF = Symbol('correlateCloneThreeGLTF');
/**
 * The Three.js GLTFLoader provides us with an in-memory representation
 * of a glTF in terms of Three.js constructs. It also provides us with a copy
 * of the deserialized glTF without any Three.js decoration, and a mapping of
 * glTF elements to their corresponding Three.js constructs.
 *
 * A CorrelatedSceneGraph exposes a synchronously available mapping of glTF
 * element references to their corresponding Three.js constructs.
 */
export class CorrelatedSceneGraph {
    constructor(threeGLTF, gltf, threeObjectMap, gltfElementMap) {
        this[$threeGLTF] = threeGLTF;
        this[$gltf] = gltf;
        this[$gltfElementMap] = gltfElementMap;
        this[$threeObjectMap] = threeObjectMap;
    }
    /**
     * Produce a CorrelatedSceneGraph from a naturally generated Three.js GLTF.
     * Such GLTFs are produced by Three.js' GLTFLoader, and contain cached
     * details that expedite the correlation step.
     *
     * If a CorrelatedSceneGraph is provided as the second argument, re-correlates
     * a cloned Three.js GLTF with a clone of the glTF hierarchy used to produce
     * the upstream Three.js GLTF that the clone was created from. The result
     * CorrelatedSceneGraph is representative of the cloned hierarchy.
     */
    static from(threeGLTF, upstreamCorrelatedSceneGraph) {
        if (upstreamCorrelatedSceneGraph != null) {
            return this[$correlateCloneThreeGLTF](threeGLTF, upstreamCorrelatedSceneGraph);
        }
        else {
            return this[$correlateOriginalThreeGLTF](threeGLTF);
        }
    }
    static [$correlateOriginalThreeGLTF](threeGLTF) {
        const gltf = threeGLTF.parser.json;
        const { associations } = threeGLTF.parser;
        const gltfElementMap = new Map();
        const defaultMaterial = { name: 'Default' };
        const defaultReference = { type: 'materials', index: -1 };
        // NOTE: IE11 does not have Map iterator methods
        associations.forEach((gltfElementReference, threeObject) => {
            // Note: GLTFLoader creates a "default" material that has no corresponding
            // glTF element in the case that no materials are specified in the source
            // glTF. In this case we append a default material to allow this to be
            // operated upon.
            if (gltfElementReference == null) {
                if (defaultReference.index < 0) {
                    if (gltf.materials == null) {
                        gltf.materials = [];
                    }
                    defaultReference.index = gltf.materials.length;
                    gltf.materials.push(defaultMaterial);
                }
                gltfElementReference = defaultReference;
            }
            const { type, index } = gltfElementReference;
            const elementArray = gltf[type] || [];
            const gltfElement = elementArray[index];
            if (gltfElement == null) {
                // TODO: Maybe throw here...
                return;
            }
            let threeObjects = gltfElementMap.get(gltfElement);
            if (threeObjects == null) {
                threeObjects = new Set();
                gltfElementMap.set(gltfElement, threeObjects);
            }
            threeObjects.add(threeObject);
        });
        return new CorrelatedSceneGraph(threeGLTF, gltf, associations, gltfElementMap);
    }
    /**
     * Transfers the association between a raw glTF and a Three.js scene graph
     * to a clone of the Three.js scene graph, resolved as a new
     * CorrelatedsceneGraph instance.
     */
    static [$correlateCloneThreeGLTF](cloneThreeGLTF, upstreamCorrelatedSceneGraph) {
        const originalThreeGLTF = upstreamCorrelatedSceneGraph.threeGLTF;
        const originalGLTF = upstreamCorrelatedSceneGraph.gltf;
        const cloneGLTF = JSON.parse(JSON.stringify(originalGLTF));
        const cloneThreeObjectMap = new Map();
        const cloneGLTFELementMap = new Map();
        for (let i = 0; i < originalThreeGLTF.scenes.length; i++) {
            this[$parallelTraverseThreeScene](originalThreeGLTF.scenes[i], cloneThreeGLTF.scenes[i], (object, cloneObject) => {
                const elementReference = upstreamCorrelatedSceneGraph.threeObjectMap.get(object);
                if (elementReference != null) {
                    const { type, index } = elementReference;
                    const cloneElement = cloneGLTF[type][index];
                    cloneThreeObjectMap.set(cloneObject, { type, index });
                    const cloneObjects = cloneGLTFELementMap.get(cloneElement) || new Set();
                    cloneObjects.add(cloneObject);
                    cloneGLTFELementMap.set(cloneElement, cloneObjects);
                }
            });
        }
        return new CorrelatedSceneGraph(cloneThreeGLTF, cloneGLTF, cloneThreeObjectMap, cloneGLTFELementMap);
    }
    /**
     * Traverses two presumably identical Three.js scenes, and invokes a callback
     * for each Object3D or Material encountered, including the initial scene.
     * Adapted from
     * https://github.com/mrdoob/three.js/blob/7c1424c5819ab622a346dd630ee4e6431388021e/examples/jsm/utils/SkeletonUtils.js#L586-L596
     */
    static [$parallelTraverseThreeScene](sceneOne, sceneTwo, callback) {
        const isMesh = (object) => {
            return object.isMesh;
        };
        const traverse = (a, b) => {
            callback(a, b);
            if (a.isObject3D) {
                if (isMesh(a)) {
                    if (Array.isArray(a.material)) {
                        for (let i = 0; i < a.material.length; ++i) {
                            traverse(a.material[i], b.material[i]);
                        }
                    }
                    else {
                        traverse(a.material, b.material);
                    }
                }
                for (let i = 0; i < a.children.length; ++i) {
                    traverse(a.children[i], b.children[i]);
                }
            }
        };
        traverse(sceneOne, sceneTwo);
    }
    /**
     * The source Three.js GLTF result given to us by a Three.js GLTFLoader.
     */
    get threeGLTF() {
        return this[$threeGLTF];
    }
    /**
     * The in-memory deserialized source glTF.
     */
    get gltf() {
        return this[$gltf];
    }
    /**
     * A Map of glTF element references to arrays of corresponding Three.js
     * object references. Three.js objects are kept in arrays to account for
     * cases where more than one Three.js object corresponds to a single glTF
     * element.
     */
    get gltfElementMap() {
        return this[$gltfElementMap];
    }
    /**
     * A map of individual Three.js objects to corresponding elements in the
     * source glTF.
     */
    get threeObjectMap() {
        return this[$threeObjectMap];
    }
    loadVariant(variantIndex, onUpdate = () => { }) {
        const updatedMaterials = new Set();
        this.threeGLTF.scene.traverse(async (object) => {
            const { gltfExtensions } = object.userData;
            if (!object.isMesh || gltfExtensions == null) {
                return;
            }
            const meshVariantData = gltfExtensions['KHR_materials_variants'];
            if (meshVariantData == null) {
                return;
            }
            let materialIndex = -1;
            for (const mapping of meshVariantData.mappings) {
                if (mapping.variants.indexOf(variantIndex) >= 0) {
                    materialIndex = mapping.material;
                    break;
                }
            }
            if (materialIndex < 0) {
                return;
            }
            const material = await this.threeGLTF.parser.getDependency('material', materialIndex);
            updatedMaterials.add(materialIndex);
            object.material = material;
            this.threeGLTF.parser.assignFinalMaterial(object);
            onUpdate();
            const gltfElement = this.gltf.materials[materialIndex];
            let threeObjects = this.gltfElementMap.get(gltfElement);
            if (threeObjects == null) {
                threeObjects = new Set();
                this.gltfElementMap.set(gltfElement, threeObjects);
            }
            threeObjects.add(object.material);
        });
        return updatedMaterials;
    }
}
//# sourceMappingURL=correlated-scene-graph.js.map