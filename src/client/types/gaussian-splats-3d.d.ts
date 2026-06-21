// Minimal ambient types for @mkkellogg/gaussian-splats-3d (ships no .d.ts).
// Only the surface we use. DropInViewer is a THREE.Group that self-sorts/renders
// via its internal onBeforeRender hook, so it drops into an R3F scene as a
// <primitive>.
declare module '@mkkellogg/gaussian-splats-3d' {
  import { Object3D } from 'three';
  export class DropInViewer extends Object3D {
    constructor(options?: Record<string, unknown>);
    addSplatScene(path: string, options?: Record<string, unknown>): Promise<void>;
    dispose(): Promise<void>;
  }
}
