export type DepartmentTitle = "manager" | "deputy_manager" | "officer" | "lead";

export type DepartmentMembership = {
  userId: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  departmentTitle: DepartmentTitle;
};
