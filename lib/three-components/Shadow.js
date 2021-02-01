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
import { Box3, DirectionalLight, Mesh, PlaneBufferGeometry, ShadowMaterial, Vector3 } from 'three';
// Nothing within Offset of the bottom of the scene casts a shadow
// (this is to avoid having a baked-in shadow plane cast its own shadow).
const OFFSET = 0.002;
// The softness [0, 1] of the shadow is mapped to a resolution between
// 2^LOG_MAX_RESOLUTION and 2^LOG_MIN_RESOLUTION.
const LOG_MAX_RESOLUTION = 9;
const LOG_MIN_RESOLUTION = 6;
// Animated models are not in general contained in their bounding box, as this
// is calculated only for their resting pose. We create a cubic shadow volume
// for animated models sized to their largest bounding box dimesion multiplied
// by this scale factor.
const ANIMATION_SCALING = 2;
/**
 * The Shadow class creates a shadow that fits a given scene and follows a
 * target. This shadow will follow the scene without any updates needed so long
 * as the shadow and scene are both parented to the same object (call it the
 * scene) and this scene is passed as the target parameter to the shadow's
 * constructor. We also must constrain the scene to motion within the horizontal
 * plane and call the setRotation() method whenever the scene's Y-axis rotation
 * changes. For motion outside of the horizontal plane, this.needsUpdate must be
 * set to true.
 *
 * The softness of the shadow is controlled by changing its resolution, making
 * softer shadows faster, but less precise.
 */
export class Shadow extends DirectionalLight {
    constructor(scene, softness, side) {
        super();
        this.shadowMaterial = new ShadowMaterial;
        this.boundingBox = new Box3;
        this.size = new Vector3;
        this.isAnimated = false;
        this.side = 'bottom';
        this.needsUpdate = false;
        // We use the light only to cast a shadow, not to light the scene.
        this.intensity = 0;
        this.castShadow = true;
        this.frustumCulled = false;
        this.floor = new Mesh(new PlaneBufferGeometry, this.shadowMaterial);
        this.floor.rotateX(-Math.PI / 2);
        this.floor.receiveShadow = true;
        this.floor.castShadow = false;
        this.floor.frustumCulled = false;
        this.add(this.floor);
        scene.target.add(this);
        this.target = scene.target;
        this.setScene(scene, softness, side);
    }
    /**
     * Update the shadow's size and position for a new scene. Softness is also
     * needed, as this controls the shadow's resolution.
     */
    setScene(scene, softness, side) {
        this.side = side;
        this.isAnimated = scene.animationNames.length > 0;
        this.boundingBox.copy(scene.boundingBox);
        this.size.copy(scene.size);
        if (this.side === 'back') {
            const { min, max } = this.boundingBox;
            [min.y, min.z] = [min.z, min.y];
            [max.y, max.z] = [max.z, max.y];
            [this.size.y, this.size.z] = [this.size.z, this.size.y];
            this.rotation.x = Math.PI / 2;
            this.rotation.y = Math.PI;
        }
        const { boundingBox, size } = this;
        if (this.isAnimated) {
            const maxDimension = Math.max(size.x, size.y, size.z) * ANIMATION_SCALING;
            size.y = maxDimension;
            boundingBox.expandByVector(size.subScalar(maxDimension).multiplyScalar(-0.5));
            boundingBox.max.y = boundingBox.min.y + maxDimension;
            size.set(maxDimension, maxDimension, maxDimension);
        }
        boundingBox.getCenter(this.floor.position);
        const shadowOffset = boundingBox.max.y + size.y * OFFSET;
        if (side === 'bottom') {
            this.position.y = shadowOffset;
            this.shadow.camera.up.set(0, 0, 1);
        }
        else {
            this.position.y = 0;
            this.position.z = shadowOffset;
            this.shadow.camera.up.set(0, 1, 0);
        }
        this.setSoftness(softness);
    }
    /**
     * Update the shadow's resolution based on softness (between 0 and 1). Should
     * not be called frequently, as this results in reallocation.
     */
    setSoftness(softness) {
        const resolution = Math.pow(2, LOG_MAX_RESOLUTION -
            softness * (LOG_MAX_RESOLUTION - LOG_MIN_RESOLUTION));
        this.setMapSize(resolution);
    }
    /**
     * Lower-level version of the above function.
     */
    setMapSize(maxMapSize) {
        const { camera, mapSize, map } = this.shadow;
        const { size, boundingBox } = this;
        if (map != null) {
            map.dispose();
            this.shadow.map = null;
        }
        if (this.isAnimated) {
            maxMapSize *= ANIMATION_SCALING;
        }
        const width = Math.floor(size.x > size.z ? maxMapSize : maxMapSize * size.x / size.z);
        const height = Math.floor(size.x > size.z ? maxMapSize * size.z / size.x : maxMapSize);
        mapSize.set(width, height);
        // These pads account for the softening radius around the shadow.
        const widthPad = 2.5 * size.x / width;
        const heightPad = 2.5 * size.z / height;
        camera.left = -boundingBox.max.x - widthPad;
        camera.right = -boundingBox.min.x + widthPad;
        camera.bottom = boundingBox.min.z - heightPad;
        camera.top = boundingBox.max.z + heightPad;
        this.setScaleAndOffset(camera.zoom, 0);
        this.shadow.updateMatrices(this);
        this.floor.scale.set(size.x + 2 * widthPad, size.z + 2 * heightPad, 1);
        this.needsUpdate = true;
    }
    /**
     * Set the shadow's intensity (0 to 1), which is just its opacity. Turns off
     * shadow rendering if zero.
     */
    setIntensity(intensity) {
        this.shadowMaterial.opacity = intensity;
        if (intensity > 0) {
            this.visible = true;
            this.floor.visible = true;
        }
        else {
            this.visible = false;
            this.floor.visible = false;
        }
    }
    getIntensity() {
        return this.shadowMaterial.opacity;
    }
    /**
     * The shadow does not rotate with its parent transforms, so the rotation must
     * be manually updated here if it rotates in world space. The input is its
     * absolute orientation about the Y-axis (other rotations are not supported).
     */
    setRotation(radiansY) {
        if (this.side !== 'bottom') {
            // We don't support rotation about a horizontal axis yet.
            this.shadow.updateMatrices(this);
            return;
        }
        this.shadow.camera.up.set(Math.sin(radiansY), 0, Math.cos(radiansY));
        this.shadow.updateMatrices(this);
    }
    /**
     * The scale is also not inherited from parents, so it must be set here in
     * accordance with any transforms. An offset can also be specified to move the
     * shadow vertically relative to the bottom of the scene. Positive is up, so
     * values are generally negative.
     */
    setScaleAndOffset(scale, offset) {
        const sizeY = this.size.y;
        const inverseScale = 1 / scale;
        // Floor plane is up slightly from the bottom of the bounding box to avoid
        // Z-fighting with baked-in shadows and to stay inside the shadow camera.
        const shadowOffset = sizeY * OFFSET;
        this.floor.position.y = 2 * shadowOffset - sizeY + offset * inverseScale;
        const { camera } = this.shadow;
        camera.zoom = scale;
        camera.near = 0;
        camera.far = sizeY * scale - offset;
        camera.projectionMatrix.makeOrthographic(camera.left * scale, camera.right * scale, camera.top * scale, camera.bottom * scale, camera.near, camera.far);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
}
//# sourceMappingURL=Shadow.js.map