/* db.js — lightweight IndexedDB wrapper for the eCapital Investor Database.
 * Object stores: investors, investments, documents, audit.
 * Documents hold the actual file payload as a base64 data URL so the demo is
 * fully self-contained and persists across reloads with no backend. */
(function (global) {
  "use strict";

  const DB_NAME = "ecapital_investor_db";
  const DB_VERSION = 1;
  const STORES = {
    investors: { keyPath: "id", indexes: [["name", "name"], ["kycStatus", "kycStatus"]] },
    investments: { keyPath: "id", indexes: [["investorId", "investorId"], ["status", "status"]] },
    documents: { keyPath: "id", indexes: [["investorId", "investorId"], ["category", "category"]] },
    audit: { keyPath: "id", indexes: [["timestamp", "timestamp"]] },
  };

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        Object.entries(STORES).forEach(([name, cfg]) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: cfg.keyPath });
            (cfg.indexes || []).forEach(([idxName, keyPath]) =>
              store.createIndex(idxName, keyPath, { unique: false })
            );
          }
        });
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeNames, mode) {
    return open().then((db) => db.transaction(storeNames, mode));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  const DB = {
    uid(prefix) {
      return (prefix || "id") + "_" + Date.now().toString(36) + "_" +
        Math.random().toString(36).slice(2, 8);
    },

    async getAll(store) {
      const t = await tx(store, "readonly");
      return reqToPromise(t.objectStore(store).getAll());
    },

    async get(store, id) {
      const t = await tx(store, "readonly");
      return reqToPromise(t.objectStore(store).get(id));
    },

    async byIndex(store, indexName, value) {
      const t = await tx(store, "readonly");
      return reqToPromise(t.objectStore(store).index(indexName).getAll(value));
    },

    async put(store, record) {
      const t = await tx(store, "readwrite");
      await reqToPromise(t.objectStore(store).put(record));
      return record;
    },

    async bulkPut(store, records) {
      const t = await tx(store, "readwrite");
      const os = t.objectStore(store);
      records.forEach((r) => os.put(r));
      return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve(records);
        t.onerror = () => reject(t.error);
      });
    },

    async remove(store, id) {
      const t = await tx(store, "readwrite");
      await reqToPromise(t.objectStore(store).delete(id));
    },

    async clearAll() {
      const t = await tx(Object.keys(STORES), "readwrite");
      Object.keys(STORES).forEach((s) => t.objectStore(s).clear());
      return new Promise((resolve, reject) => {
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      });
    },

    async count(store) {
      const t = await tx(store, "readonly");
      return reqToPromise(t.objectStore(store).count());
    },

    /** Append an audit-trail entry. Returns the entry. */
    async logAudit(action, entityType, entityId, detail) {
      const entry = {
        id: DB.uid("aud"),
        timestamp: new Date().toISOString(),
        action,
        entityType,
        entityId: entityId || null,
        detail: detail || "",
      };
      await DB.put("audit", entry);
      return entry;
    },
  };

  global.DB = DB;
})(window);
