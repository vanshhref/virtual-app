// Backend/src/models/User.ts
import { dbService } from '../services/Database.js';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  username: string;
  email?: string;
  password?: string;
  avatar_sprite: string;
  avatar_color: string;
  created_at: string;
}

export class UserModel {
  static async findByUsername(username: string): Promise<User | undefined> {
    const db = dbService.getDb();
    return await db.get('SELECT * FROM users WHERE username = ?', [username]);
  }

  static async findByEmail(email: string): Promise<User | undefined> {
    const db = dbService.getDb();
    return await db.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  static async findById(id: string): Promise<User | undefined> {
    const db = dbService.getDb();
    return await db.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  static async create(userData: any): Promise<User> {
    const db = dbService.getDb();
    const id = uuidv4();
    const { username, email, password, avatar_sprite, avatar_color } = userData;

    await db.run(
      `INSERT INTO users (id, username, email, password, avatar_sprite, avatar_color) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, username, email, password, avatar_sprite || 'worker-yellow', avatar_color || '#ffffff']
    );

    const newUser = await this.findById(id);
    return newUser!;
  }

  static async updateAvatar(id: string, sprite: string, color: string): Promise<void> {
    const db = dbService.getDb();
    await db.run(
      'UPDATE users SET avatar_sprite = ?, avatar_color = ? WHERE id = ?',
      [sprite, color, id]
    );
  }
}
