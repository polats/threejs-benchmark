export const originalRandom = Math.random;

export const SEED_STORAGE_KEY = 'WFC_SEED_SLOTS';
export const MAX_SEED_SLOTS = 8;
export const DEFAULT_STARTING_SEED = 3049685445;

let seedRNG = null;
let currentSeed = null;
let onSeedChange = () => {};

function seededRandom() {
	if (seedRNG === null) {
		const generatedSeed = Math.floor(originalRandom() * 0xFFFFFFFF);
		setSeed(generatedSeed);
		console.log('Generated new seed:', generatedSeed);
	}
	seedRNG = (seedRNG + 0x6D2B79F5) | 0;
	let t = Math.imul(seedRNG ^ (seedRNG >>> 15), seedRNG | 1);
	t = t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function installSeededRandom({ seed = DEFAULT_STARTING_SEED, handleSeedChange = () => {} } = {}) {
	onSeedChange = handleSeedChange;
	setSeed(seed);
	Math.random = seededRandom;
}

export function withOriginalRandom(callback) {
	const currentRandom = Math.random;
	Math.random = originalRandom;
	try {
		return callback();
	} finally {
		Math.random = currentRandom;
	}
}

export function setSeed(seed) {
	currentSeed = seed;
	seedRNG = seed;
	onSeedChange(currentSeed);
}

export function getCurrentSeed() {
	return currentSeed;
}

export function loadSeedSlots() {
	const stored = localStorage.getItem(SEED_STORAGE_KEY);
	if (stored) {
		try {
			return JSON.parse(stored);
		} catch (error) {
			console.error("Failed to load seed slots", error);
		}
	}
	return [];
}

export function saveSeedSlots(slots) {
	localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify(slots));
}
