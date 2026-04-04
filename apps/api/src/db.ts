import { createSqliteStorage } from "@openoutlier/storage";
import { config } from "./config.js";

const storage = createSqliteStorage(config.databasePath);

export const db = storage.db;
export const initializeDatabase = storage.initializeDatabase;
export const getSetting = storage.getSetting;
export const upsertSetting = storage.upsertSetting;
