// backend.js — Appwrite Integration
import { Client, Account, Databases, ID, Query } from 'https://cdn.jsdelivr.net/npm/appwrite@14.0.0/+esm';
import { appwriteConfig } from './config.js';

const client = new Client()
    .setEndpoint(appwriteConfig.endpoint)
    .setProject(appwriteConfig.projectId);

const account = new Account(client);
const databases = new Databases(client);

// Database IDs
const DATABASE_ID = 'daylog_db'; 
const COLLECTION_ID = 'daily_logs';

export const authActions = {
    getUser: () => account.get(),
    register: (email, pw) => account.create(ID.unique(), email, pw),
    login: (email, pw) => account.createEmailPasswordSession(email, pw),
    logout: () => account.deleteSessions(),
    onStateChange: (cb) => {
        account.get()
            .then(user => cb(user))
            .catch(() => cb(null));
    }
};

export const dbActions = {
    async getDay(uid, date) {
        try {
            const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.equal('date', date)
            ]);
            return res.documents[0] || { tasks: "[]", habits: "{}", schedule: "[]", notes: "", score: 0 };
        } catch (e) {
            console.warn("DB fetch failed:", e);
            return null;
        }
    },
    async saveDay(uid, date, data) {
        try {
            const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.equal('date', date)
            ]);

            const payload = {
                uid,
                date,
                tasks: JSON.stringify(data.tasks || []),
                habits: JSON.stringify(data.habits || {}),
                schedule: JSON.stringify(data.schedule || []),
                notes: data.notes || "",
                score: String(data.score || 0),
                priorities: "" 
            };

            console.log("Saving to Cloud...", payload);

            if (existing.total > 0) {
                await databases.updateDocument(DATABASE_ID, COLLECTION_ID, existing.documents[0].$id, payload);
            } else {
                await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), payload);
            }
            console.log("Save Successful! ✓");
        } catch (e) {
            console.error("CRITICAL SAVE ERROR:", e);
            alert("Database Error: Make sure you added the 'schedule' attribute in Appwrite Console!");
        }
    },
    async getHistory(uid) {
        try {
            const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.orderDesc('date'),
                Query.limit(14)
            ]);
            const history = {};
            res.documents.forEach(doc => {
                history[doc.date] = {
                    score: parseInt(doc.score || 0),
                    tasks: JSON.parse(doc.tasks || '[]'),
                    habits: JSON.parse(doc.habits || '{}'),
                    schedule: JSON.parse(doc.schedule || '[]'),
                    notes: doc.notes || ""
                };
            });
            return history;
        } catch (e) {
            console.error("getHistory Error:", e);
            return {};
        }
    },
    async getSettings(uid) {
        try {
            const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.equal('date', 'user_settings')
            ]);
            if (res.total > 0) {
                return JSON.parse(res.documents[0].habits || '[]');
            }
            return null;
        } catch (e) {
            console.error("getSettings Error:", e);
            return null;
        }
    },
    async saveSettings(uid, habits) {
        try {
            const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.equal('date', 'user_settings')
            ]);
            const payload = {
                uid,
                date: 'user_settings',
                habits: JSON.stringify(habits),
                tasks: "[]",
                schedule: "[]",
                notes: "SETTINGS_DOC",
                score: "0",
                priorities: ""
            };
            if (existing.total > 0) {
                await databases.updateDocument(DATABASE_ID, COLLECTION_ID, existing.documents[0].$id, payload);
            } else {
                await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), payload);
            }
        } catch (e) {
            console.error("saveSettings Error:", e);
        }
    },
    async getRoadmaps(uid) {
        try {
            const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.equal('date', 'user_roadmaps')
            ]);
            if (res.total > 0) {
                return JSON.parse(res.documents[0].tasks || '[]');
            }
            return [];
        } catch (e) {
            console.error("getRoadmaps Error:", e);
            return [];
        }
    },
    async saveRoadmaps(uid, roadmaps) {
        try {
            const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.equal('date', 'user_roadmaps')
            ]);
            const payload = {
                uid,
                date: 'user_roadmaps',
                tasks: JSON.stringify(roadmaps),
                habits: "{}",
                schedule: "[]",
                notes: "ROADMAPS_DOC",
                score: "0",
                priorities: ""
            };
            if (existing.total > 0) {
                await databases.updateDocument(DATABASE_ID, COLLECTION_ID, existing.documents[0].$id, payload);
            } else {
                await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), payload);
            }
        } catch (e) {
            console.error("saveRoadmaps Error:", e);
        }
    },
    async getLibrary(uid) {
        try {
            const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.equal('date', 'user_library')
            ]);
            if (res.total > 0) {
                return JSON.parse(res.documents[0].tasks || '[]');
            }
            return [];
        } catch (e) {
            console.error("getLibrary Error:", e);
            return [];
        }
    },
    async saveLibrary(uid, library) {
        try {
            const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
                Query.equal('uid', uid),
                Query.equal('date', 'user_library')
            ]);
            const payload = {
                uid,
                date: 'user_library',
                tasks: JSON.stringify(library),
                habits: "{}",
                schedule: "[]",
                notes: "LIBRARY_DOC",
                score: "0",
                priorities: ""
            };
            if (existing.total > 0) {
                await databases.updateDocument(DATABASE_ID, COLLECTION_ID, existing.documents[0].$id, payload);
            } else {
                await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), payload);
            }
        } catch (e) {
            console.error("saveLibrary Error:", e);
        }
    }
};
