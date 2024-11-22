// Create the admin user in the "admin" database
db = db.getSiblingDB("admin");
db.auth("admin", "admin");

// Switch to the "syscoin-bridge" database and create a read/write user
db = db.getSiblingDB("syscoin-bridge");
db.createUser({
  user: "admin",
  pwd: "admin",
  roles: [{ role: "readWrite", db: "syscoin-bridge" }],
});
