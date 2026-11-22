import mongoose from "mongoose";

const schema = new mongoose.Schema<{ _id: string; expiresAt: Date }>({
  _id: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});

const makeModel = () => mongoose.model("AdminAuthorizationUse", schema);

const AdminAuthorizationUse: ReturnType<typeof makeModel> =
  mongoose.models.AdminAuthorizationUse ?? makeModel();

export default AdminAuthorizationUse;
