// Added for the benchmark host: a shared enable flag so the Shadow Tint feature
// can be toggled at runtime.
export const shadowTintUniforms = { uShadowTintEnabled: { value: 1 } };

export function applyShadowTint(material) {
	if (Array.isArray(material)) {
		material.forEach(applyShadowTint);
		return;
	}
	if (!material) return;
	if (material.userData.shadowTintApplied) return;

	const previousOnBeforeCompile = material.onBeforeCompile;
	const previousCacheKey = material.customProgramCacheKey;

	material.customProgramCacheKey = function() {
		const existingKey = previousCacheKey ? previousCacheKey.call(this) : '';
		return `${existingKey}_shadowTint`;
	};

	material.onBeforeCompile = (shader, renderer) => {
		if (previousOnBeforeCompile) previousOnBeforeCompile(shader, renderer);
		shader.uniforms.uShadowTintEnabled = shadowTintUniforms.uShadowTintEnabled;

		let appliedFragment = false;
		shader.fragmentShader = ('uniform float uShadowTintEnabled;\n' + shader.fragmentShader).replace('#include <dithering_fragment>', () => {
			appliedFragment = true;
			return `
				vec3 shadowTintColor = vec3(0.216, 0.176, 0.271);
				float shadowTintLuminance = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
				float shadowTintMask = 1.0 - smoothstep(0.0, 0.35, shadowTintLuminance);
				gl_FragColor.rgb = mix(gl_FragColor.rgb, shadowTintColor, shadowTintMask * 0.6 * uShadowTintEnabled);
				#include <dithering_fragment>
			`;
		});

		if (!appliedFragment) {
			console.warn('[DEBUG] Shadow tint shader patch missed expected chunk', {
				material: material.name || material.type
			});
		}
	};
	material.userData.shadowTintApplied = true;

	material.needsUpdate = true;
}
