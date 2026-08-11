import Admin, { IAdmin } from "../../models/admin";

export const normalizeAdminAddress = (address: string) =>
  address.trim().toLowerCase();

export class AdminService {
  public async isAdmin(address: string): Promise<boolean> {
    const admin = await Admin.exists({
      address: normalizeAdminAddress(address),
    }).exec();

    return admin !== null;
  }

  public async getAdmin(address: string): Promise<IAdmin | null> {
    const admin = await Admin.findOne({
      address: normalizeAdminAddress(address),
    }).exec();
    if (!admin) {
      return null;
    }

    return admin;
  }

  public async createAdmin(address: string, name: string): Promise<IAdmin> {
    const normalizedAddress = normalizeAdminAddress(address);
    // Check if address is already an admin
    const isAdmin = await this.isAdmin(normalizedAddress);

    if (isAdmin) {
      throw new Error("Address is already an admin");
    }

    const admin = new Admin({ address: normalizedAddress, name: name.trim() });

    return await admin.save();
  }
}
