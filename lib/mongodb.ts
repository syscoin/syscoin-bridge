import mongoose, { ConnectOptions } from "mongoose";
import { ensureSponsorIndexes } from "models/ensure-sponsor-indexes";
declare global {
  var mongoose: any; // This must be a `var` and not a `let / const`
}

const MONGODB_URI = process.env.MONGODB_URI!;

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null, indexPromise: null };
}

async function dbConnect() {
  if (cached.conn) {
    if (!cached.indexPromise) {
      cached.indexPromise = ensureSponsorIndexes();
    }
    await cached.indexPromise;
    return cached.conn;
  }
  if (!cached.promise) {
    const opts: ConnectOptions = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  try {
    cached.conn = await cached.promise;
    if (!cached.indexPromise) {
      cached.indexPromise = ensureSponsorIndexes();
    }
    await cached.indexPromise;
  } catch (e) {
    cached.promise = null;
    cached.indexPromise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
