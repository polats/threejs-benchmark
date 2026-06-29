import * as THREE from 'three';
import { initCloudCookie, applyCloudCookie, updateCloudCookie, setCloudCookieDebugOnly, setCloudCookieIntensityPercent, setCloudCookieScalePercent, setCloudCookieTintColor, setCloudCookieVisible } from './CloudCookie.js';
import { applyShadowTint } from './ShadowTint.js';
import { applyWindSway, isWindSwayBushName, isWindSwayObjectName } from './WindSway.js';
import { applyVerticalGradient, GRADIENT_PRESETS } from './VerticalGradient.js';

const rampData = new Uint8Array([
	30, 30, 30, 255,
	150, 150, 150, 255,
	255, 255, 255, 255
]);

export const toonGradientMap = new THREE.DataTexture(rampData, 3, 1, THREE.RGBAFormat);
toonGradientMap.needsUpdate = true;
toonGradientMap.magFilter = THREE.NearestFilter;
toonGradientMap.minFilter = THREE.NearestFilter;
toonGradientMap.generateMipmaps = false;
toonGradientMap.wrapS = THREE.ClampToEdgeWrapping;
toonGradientMap.wrapT = THREE.ClampToEdgeWrapping;
toonGradientMap.colorSpace = THREE.SRGBColorSpace;

let celShadingMode = 2;

export {
	GRADIENT_PRESETS,
	initCloudCookie,
	updateCloudCookie,
	setCloudCookieDebugOnly,
	setCloudCookieIntensityPercent,
	setCloudCookieScalePercent,
	setCloudCookieTintColor,
	setCloudCookieVisible
};

export function paletteTexture(texture, { colorSpace = THREE.SRGBColorSpace, nearest = true, mipmaps = false } = {}) {
	if (!texture) return;
	texture.colorSpace = colorSpace;
	texture.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
	texture.minFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
	texture.generateMipmaps = mipmaps;
}

export function applyMaterialShaderChain(material, gradientPreset) {
	applyVerticalGradient(material, gradientPreset);
	delete material.userData.cloudCookieApplied;
	delete material.userData.shadowTintApplied;
	delete material.userData.windApplied;
	applyCloudCookie(material);
	applyShadowTint(material);
}

export function createToonMaterial(srcOrOptions = {}, overrides = {}) {
	const isMaterial = !!srcOrOptions?.isMaterial;
	const srcMat = isMaterial ? srcOrOptions : null;
	const options = isMaterial ? {} : (srcOrOptions || {});

	const { flatShading, gradientMap: _ignoredGradientMap, color: optionsColor, ...validOptions } = options;

	const material = new THREE.MeshToonMaterial({
		...(isMaterial ? {
			color: srcMat?.color ?? 0xffffff,
			map: srcMat?.map ?? null,
			alphaMap: srcMat?.alphaMap ?? null,
			transparent: srcMat?.transparent,
			opacity: srcMat?.opacity,
			side: srcMat?.side
		} : {
			color: optionsColor !== undefined ? optionsColor : 0xffffff
		}),
		gradientMap: toonGradientMap,
		...validOptions,
		...overrides
	});

	paletteTexture(material.map, { colorSpace: THREE.SRGBColorSpace, nearest: true, mipmaps: false });
	paletteTexture(material.alphaMap, { colorSpace: THREE.NoColorSpace, nearest: true, mipmaps: false });

	applyMaterialShaderChain(material, GRADIENT_PRESETS.tiles);

	return material;
}

export function isBillboardObject(name) {
	return name && (name.startsWith('Billboard_') || name.startsWith('BillboardUnlit_'));
}

export function convertToToonMaterial(mesh, {
	force = false,
	alphaTest = 0.5,
	transparent = false,
	setShadows = true,
	sharedLiquidMaterial = null,
	shadowsEnabled = true
} = {}) {
	if (!mesh?.isMesh || !mesh.material) return;

	if (mesh.name && mesh.name.includes('_Liquid')) {
		mesh.material = sharedLiquidMaterial;
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		return;
	}

	if (setShadows) {
		const isDecal = mesh.name && mesh.name.includes('Decal_');
		mesh.castShadow = isDecal ? false : shadowsEnabled;
		mesh.receiveShadow = shadowsEnabled;
	}

	const originalWasArray = Array.isArray(mesh.material);
	const materials = originalWasArray ? mesh.material : [mesh.material];
	const converted = materials.map((material) => {
		if (!force && (material instanceof THREE.MeshToonMaterial) && material.gradientMap) {
			applyMaterialShaderChain(material, material.userData.gradientConfig || GRADIENT_PRESETS.tiles);
			return material;
		}
		return createToonMaterial(material, { alphaTest, transparent });
	});

	mesh.material = originalWasArray ? converted : converted[0];
	const baseName = mesh.name ? mesh.name.replace(/_\d+$/, '') : '';
	if (isWindSwayObjectName(baseName)) {
		applyWindSway(mesh.material, { isBush: isWindSwayBushName(baseName) });
	}
}

export function applyLandscapeMaterial(child, options = {}) {
	const { trackBillboard, force = false, sharedLiquidMaterial = null } = options;
	const baseName = child.name.replace(/_\d+$/, '');

	if (child.name.includes('_Liquid')) {
		return {
			material: sharedLiquidMaterial,
			materialType: 'liquid',
			needsGradient: false,
			castShadow: false,
			receiveShadow: true
		};
	} else if (isBillboardObject(baseName)) {
		const sourceMaterial = child.material;
		const material = new THREE.MeshBasicMaterial({
			map: sourceMaterial.map,
			color: sourceMaterial.color,
			alphaTest: 0.5,
			side: sourceMaterial.side || THREE.FrontSide
		});
		if (trackBillboard) trackBillboard(child);
		return {
			material,
			materialType: 'billboard',
			needsGradient: true,
			gradientPreset: baseName.startsWith('BillboardUnlit_') ? GRADIENT_PRESETS.billboardUnlit : GRADIENT_PRESETS.billboard,
			castShadow: false,
			receiveShadow: false
		};
	} else if (baseName.startsWith('Building_')) {
		convertToToonMaterial(child, { force, alphaTest: 0.5, transparent: false, sharedLiquidMaterial });
		return {
			material: child.material,
			materialType: 'building',
			needsGradient: true,
			gradientPreset: GRADIENT_PRESETS.buildings,
			castShadow: true,
			receiveShadow: true
		};
	} else if (baseName.startsWith('Foliage_')) {
		convertToToonMaterial(child, { force, alphaTest: 0.5, transparent: false, sharedLiquidMaterial });
		return {
			material: child.material,
			materialType: 'foliage',
			needsGradient: true,
			gradientPreset: GRADIENT_PRESETS.foliage,
			castShadow: true,
			receiveShadow: true
		};
	}

	convertToToonMaterial(child, { force, alphaTest: 0.5, transparent: false, sharedLiquidMaterial });
	return {
		material: child.material,
		materialType: 'default',
		needsGradient: false,
		castShadow: true,
		receiveShadow: true
	};
}

function setRampPixel(pixelIndex, red, green, blue, alpha) {
	const offset = pixelIndex * 4;
	rampData[offset] = red;
	rampData[offset + 1] = green;
	rampData[offset + 2] = blue;
	rampData[offset + 3] = alpha;
}

export function setCelShadingMode(mode) {
	celShadingMode = mode;
	if (celShadingMode === 0) {
		setRampPixel(0, 255, 255, 255, 255);
		setRampPixel(1, 255, 255, 255, 255);
		setRampPixel(2, 255, 255, 255, 255);
	} else if (celShadingMode === 1) {
		setRampPixel(0, 30, 30, 30, 255);
		setRampPixel(1, 255, 255, 255, 255);
		setRampPixel(2, 255, 255, 255, 255);
	} else {
		setRampPixel(0, 30, 30, 30, 255);
		setRampPixel(1, 150, 150, 150, 255);
		setRampPixel(2, 255, 255, 255, 255);
	}

	toonGradientMap.needsUpdate = true;
}

export function getCelShadingMode() {
	return celShadingMode;
}
