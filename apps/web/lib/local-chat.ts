export type LocalChatMessage = {
  id: string;
  from: string;
  fromUserId: string | null;
  to: string | null;
  toUserId: string | null;
  name: string;
  avatarUrl: string | null;
  text: string;
  image: string | null;
  time: number;
};
type StoredMessage = LocalChatMessage & { key: string; ownerId: string };

function openChatDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('netverse-local-chat', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('messages', { keyPath: 'key' });
      store.createIndex('ownerId', 'ownerId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadChatMessages(ownerId: string): Promise<LocalChatMessage[]> {
  const db = await openChatDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('messages', 'readonly');
    const request = transaction.objectStore('messages').index('ownerId').getAll(ownerId);
    request.onsuccess = () =>
      resolve(
        (request.result as StoredMessage[])
          .sort((a, b) => a.time - b.time)
          .map((item) => ({
            id: item.id,
            from: item.from,
            fromUserId: item.fromUserId,
            to: item.to,
            toUserId: item.toUserId,
            name: item.name,
            avatarUrl: item.avatarUrl,
            text: item.text,
            image: item.image,
            time: item.time,
          })),
      );
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveChatMessage(ownerId: string, message: LocalChatMessage): Promise<void> {
  const db = await openChatDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('messages', 'readwrite');
    transaction
      .objectStore('messages')
      .put({ ...message, key: `${ownerId}:${message.id}`, ownerId });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
