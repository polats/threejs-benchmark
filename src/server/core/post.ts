import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'Three.js benchmarks — how much can your device render?',
  });
};
