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
    }
};
