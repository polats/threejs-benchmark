import { Hono } from 'hono';
import { createPost } from '../core/post';

export const triggers = new Hono();

// Create a launch post automatically when the app is installed into a subreddit.
triggers.post('/on-app-install', async (c) => {
  await createPost();
  return c.json({ status: 'ok' });
});
