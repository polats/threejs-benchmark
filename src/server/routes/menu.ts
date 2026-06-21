import { Hono } from 'hono';
import { createPost } from '../core/post';

export const menu = new Hono();

// Wired to the "Create a new Three.js post" moderator menu item in devvit.json.
menu.post('/post-create', async (c) => {
  const post = await createPost();
  return c.json({
    navigateTo: `https://reddit.com/r/${post.subredditName}/comments/${post.id}`,
  });
});
