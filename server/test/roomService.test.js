import test from 'node:test';
import assert from 'node:assert/strict';
import Room from '../src/models/Room.js';
import { listRooms } from '../src/services/roomService.js';

test('room catalogue returns summaries from projected room documents', async () => {
  const originalFind = Room.find;
  Room.find = () => ({
    sort() { return this; },
    limit() { return this; },
    async lean() {
      // Mirrors the projection used by listRooms: no obstacles/spawnPoints.
      return [
        { roomId: 'lobby', name: 'Lobby', description: 'Open office', width: 1920, height: 1080, liveUsers: 2 },
        { roomId: 'studio', name: 'Studio', description: 'Quiet space', width: 1920, height: 1080, liveUsers: 0 },
      ];
    },
  });

  try {
    const rooms = await listRooms();
    assert.deepEqual(rooms.map(({ roomId, name }) => ({ roomId, name })), [
      { roomId: 'lobby', name: 'Lobby' },
      { roomId: 'studio', name: 'Studio' },
    ]);
    assert.equal(rooms[0].width, 1920);
  } finally {
    Room.find = originalFind;
  }
});
