import { DEFAULT_GODRAY_BEAM_OPACITY_PERCENT, DEFAULT_GODRAY_GROUND_COLOR, DEFAULT_GODRAY_GROUND_OPACITY_PERCENT, DEFAULT_GODRAY_LOWER_AMOUNT, DEFAULT_GODRAY_SPREAD_PERCENT } from './GodraySettings.js';
import * as THREE from 'three';

const sunDirectionScratch = new THREE.Vector3();

export function createGodrayController(dependencies) {
	const {
		godraySystem,
		withOriginalRandom,
		getSun,
		shouldLogCellInfo,
		updateHint
	} = dependencies;

	let enabled = true;
	let groundVisible = true;
	let debugVisible = false;
	let groundNoiseOnly = false;
	let groundColor = DEFAULT_GODRAY_GROUND_COLOR;
	let beamOpacityPercent = DEFAULT_GODRAY_BEAM_OPACITY_PERCENT;
	let groundOpacityPercent = DEFAULT_GODRAY_GROUND_OPACITY_PERCENT;
	let beamLowerAmount = DEFAULT_GODRAY_LOWER_AMOUNT;
	let spreadPercent = DEFAULT_GODRAY_SPREAD_PERCENT;

	function createOptionsFromSun() {
		const sun = getSun();
		sunDirectionScratch.copy(sun.position).sub(sun.target.position);
		const horizontalDistance = Math.sqrt(sunDirectionScratch.x * sunDirectionScratch.x + sunDirectionScratch.z * sunDirectionScratch.z);
		return {
			count: 4,
			color: 0xffffff,
			beamDirection: Math.atan2(sunDirectionScratch.x, sunDirectionScratch.z),
			beamAngle: Math.atan2(sunDirectionScratch.y, horizontalDistance),
			beamHeight: 12,
			beamOpacity: 0.16,
			groundOpacity: 0.10,
			minGroundPolygonSize: 2.5,
			maxGroundPolygonSize: 9.0,
			spread: spreadPercent / 100,
			logGeneration: shouldLogCellInfo()
		};
	}

	function generateFromSun() {
		withOriginalRandom(() => {
			godraySystem.setOpacityPercent(beamOpacityPercent);
			godraySystem.setGroundOpacityPercent(groundOpacityPercent);
			godraySystem.setBeamLowerAmount(beamLowerAmount);
			godraySystem.setPlacementSpreadPercent(spreadPercent);
			godraySystem.setGroundColor(groundColor);
			godraySystem.generate(createOptionsFromSun());
		});
	}

	function updateVisibilityHint(hintId, label, visible) {
		const statusText = `${label} ${visible ? 'on' : 'off'}`;
		const statusColor = visible ? '#4ecdc4' : '#ff6b6b';
		updateHint(hintId, statusText, statusColor);
	}

	function updateEffectsHints() {
		updateVisibilityHint('godray-ground-hint', 'Godray ground areas', groundVisible);
		updateVisibilityHint('godray-debug-hint', 'Ray debug', debugVisible);
		updateVisibilityHint('godray-noise-hint', 'Pool noise', groundNoiseOnly);
	}

	function toggleEnabled() {
		enabled = godraySystem.toggleEnabled();
		return enabled;
	}

	function toggleGround() {
		groundVisible = godraySystem.toggleGround();
		updateEffectsHints();
		return groundVisible;
	}

	function toggleDebug() {
		debugVisible = godraySystem.toggleDebug();
		updateEffectsHints();
		return debugVisible;
	}

	function toggleGroundNoiseOnly() {
		groundNoiseOnly = godraySystem.toggleGroundNoiseOnly();
		updateEffectsHints();
		return groundNoiseOnly;
	}

	return {
		init: (scene) => godraySystem.init(scene),
		generateFromSun,
		update: (dt, activeCamera) => godraySystem.update(dt, activeCamera),
		setOpacityPercent: (percent) => {
			beamOpacityPercent = percent;
			godraySystem.setOpacityPercent(percent);
		},
		setGroundOpacityPercent: (percent) => {
			groundOpacityPercent = percent;
			godraySystem.setGroundOpacityPercent(percent);
		},
		setBeamLowerAmount: (value) => {
			beamLowerAmount = value;
			godraySystem.setBeamLowerAmount(value);
		},
		setSpreadPercent: (percent) => {
			spreadPercent = percent;
			godraySystem.setPlacementSpreadPercent(percent);
			generateFromSun();
		},
		setGroundColor: (color) => {
			groundColor = color;
			godraySystem.setGroundColor(color);
		},
		toggleEnabled,
		toggleGround,
		toggleDebug,
		toggleGroundNoiseOnly,
		updateEffectsHints,
		getEnabled: () => enabled,
		getGroundVisible: () => groundVisible,
		getDebugVisible: () => debugVisible,
		getGroundNoiseOnly: () => groundNoiseOnly
	};
}
