"use client";

import { useEffect, useMemo, useState } from "react";

type DepartmentTitle = "manager" | "deputy_manager" | "officer" | "lead";

type UserRole = {
  id: string;
  code: string;
  name: string;
};

type Department = {
  id: string;
  code: string;
  name: string;
};

type UserItem = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  deletedAt: string | null;
  department: {
    id: string | null;
    code: string | null;
    name: string | null;
    title: DepartmentTitle | null;
  } | null;
  roles: UserRole[];
};

type UsersResponse = {
  users: UserItem[];
  roles: UserRole[];
  departments: Department[];
  departmentTitles: DepartmentTitle[];
};

type SessionResponse = {
  isStaff: boolean;
  isAdmin: boolean;
  staffUserId: string | null;
};

type CreateForm = {
  email: string;
  fullName: string;
  isActive: boolean;
  departmentId: string;
  departmentTitle: DepartmentTitle;
  roleCodes: string[];
};

type EditForm = {
  fullName: string;
  isActive: boolean;
  departmentId: string;
  departmentTitle: DepartmentTitle;
  roleCodes: string[];
};

export default function DashboardUsersPage() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentTitles, setDepartmentTitles] = useState<DepartmentTitle[]>([]);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const editingUser = useMemo(
    () => users.find((user) => user.id === editingUserId) ?? null,
    [editingUserId, users]
  );

  const filteredUsers = useMemo(() => {
    const term = searchText.trim().toLowerCase();

    return users.filter((user) => {
      if (statusFilter === "active" && !user.isActive) return false;
      if (statusFilter === "inactive" && user.isActive) return false;

      if (roleFilter !== "all" && !user.roles.some((role) => role.code === roleFilter)) {
        return false;
      }

      if (!term) return true;

      const searchable = [
        user.fullName,
        user.email,
        user.department?.name ?? "",
        user.department?.title ?? "",
        user.roles.map((role) => role.code).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [users, searchText, statusFilter, roleFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pagedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page]);

  async function loadSession() {
    setLoadingSession(true);
    try {
      const response = await fetch("/api/staff/session", { cache: "no-store" });
      const data = (await response.json()) as SessionResponse;
      setSession(data);
    } finally {
      setLoadingSession(false);
    }
  }

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await response.json()) as UsersResponse & { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to load users");
      }

      setUsers(data.users ?? []);
      setRoles(data.roles ?? []);
      setDepartments(data.departments ?? []);
      setDepartmentTitles(data.departmentTitles ?? []);

      const firstDepartmentId = data.departments?.[0]?.id ?? "";
      const firstTitle = (data.departmentTitles?.[0] ?? "officer") as DepartmentTitle;
      setCreateForm(
        (current) =>
          current ?? {
            email: "",
            fullName: "",
            isActive: true,
            departmentId: firstDepartmentId,
            departmentTitle: firstTitle,
            roleCodes: ["reporter"],
          }
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (!session?.isAdmin) {
      return;
    }

    void loadUsers();
  }, [session?.isAdmin]);

  useEffect(() => {
    setPage(1);
  }, [searchText, statusFilter, roleFilter]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  function startEdit(user: UserItem) {
    setEditingUserId(user.id);
    setMessage("");
    setError("");

    setForm({
      fullName: user.fullName,
      isActive: user.isActive,
      departmentId: user.department?.id ?? departments[0]?.id ?? "",
      departmentTitle: user.department?.title ?? departmentTitles[0] ?? "officer",
      roleCodes: user.roles.map((role) => role.code),
    });
  }

  async function saveUser() {
    if (!editingUserId || !form) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/users/${editingUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          isActive: form.isActive,
          departmentId: form.departmentId,
          departmentTitle: form.departmentTitle,
          roleCodes: form.roleCodes,
        }),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to save user");
      }

      await loadUsers();
      setMessage("User updated successfully.");
      setEditingUserId(null);
      setForm(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function createUser() {
    if (!createForm) {
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to create user");
      }

      await loadUsers();
      setMessage("User created successfully.");
      setCreateForm((current) =>
        current
          ? {
              ...current,
              email: "",
              fullName: "",
              roleCodes: ["reporter"],
            }
          : current
      );
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(userId: string) {
    const proceed = window.confirm("Delete this user account? This will deactivate the user.");
    if (!proceed) {
      return;
    }

    setDeletingUserId(userId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to delete user");
      }

      await loadUsers();
      setMessage("User deleted successfully.");

      if (editingUserId === userId) {
        setEditingUserId(null);
        setForm(null);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete user");
    } finally {
      setDeletingUserId(null);
    }
  }

  if (loadingSession) {
    return (
      <div className="p-5 md:p-6">
        <p className="text-sm text-slate-600">Checking permissions...</p>
      </div>
    );
  }

  if (!session?.isAdmin) {
    return (
      <div className="p-5 md:p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Admin access is required to manage users.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-5 py-4 md:px-6">
          <h1 className="text-xl font-bold md:text-2xl">User Management</h1>
          <p className="text-sm text-slate-500">
            Edit names, assign departments, update roles, and deactivate users.
          </p>
        </header>

        <section className="space-y-4 p-5 md:p-6">
          {message ? (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>
          ) : null}
          {error ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setShowCreateForm((current) => !current);
              }}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
            >
              {showCreateForm ? "Close Create User" : "Create User"}
            </button>
          </div>

          {createForm && showCreateForm ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-base font-semibold text-slate-900">Create User</h2>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  Full name
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    value={createForm.fullName}
                    onChange={(event) => {
                      setCreateForm((current) =>
                        current ? { ...current, fullName: event.target.value } : current
                      );
                    }}
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Staff email
                  <input
                    type="email"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    value={createForm.email}
                    onChange={(event) => {
                      setCreateForm((current) =>
                        current ? { ...current, email: event.target.value } : current
                      );
                    }}
                    placeholder="firstName.lastName@nnpcgroup.com"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Department
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                    value={createForm.departmentId}
                    onChange={(event) => {
                      setCreateForm((current) =>
                        current ? { ...current, departmentId: event.target.value } : current
                      );
                    }}
                  >
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  Department title
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                    value={createForm.departmentTitle}
                    onChange={(event) => {
                      setCreateForm((current) =>
                        current
                          ? {
                              ...current,
                              departmentTitle: event.target.value as DepartmentTitle,
                            }
                          : current
                      );
                    }}
                  >
                    {departmentTitles.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createForm.isActive}
                    onChange={(event) => {
                      setCreateForm((current) =>
                        current ? { ...current, isActive: event.target.checked } : current
                      );
                    }}
                  />
                  Active user
                </label>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-800">Global roles</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.map((role) => {
                    const checked = createForm.roleCodes.includes(role.code);
                    return (
                      <label
                        key={role.code}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setCreateForm((current) => {
                              if (!current) return current;

                              const nextRoleCodes = event.target.checked
                                ? Array.from(new Set([...current.roleCodes, role.code]))
                                : current.roleCodes.filter((code) => code !== role.code);

                              return {
                                ...current,
                                roleCodes: nextRoleCodes,
                              };
                            });
                          }}
                        />
                        {role.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void createUser();
                  }}
                  disabled={creating}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {creating ? "Creating..." : "Create user"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Filters</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-sm text-slate-700">
                Search
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="Name, email, role..."
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
              </label>

              <label className="text-sm text-slate-700">
                Status
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "all" | "active" | "inactive")
                  }
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <label className="text-sm text-slate-700">
                Role
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                >
                  <option value="all">All roles</option>
                  {roles.map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loading ? <p className="text-sm text-slate-600">Loading users...</p> : null}

          {!loading ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Email</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Department</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Title</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Roles</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="px-3 py-2 font-semibold text-slate-800">{user.fullName}</td>
                      <td className="px-3 py-2 text-slate-700">{user.email}</td>
                      <td className="px-3 py-2 text-slate-700">{user.department?.name ?? "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{user.department?.title ?? "-"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {user.roles.map((r) => r.code).join(", ")}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {user.isActive ? "Active" : "Inactive"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(user)}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void deleteUser(user.id);
                            }}
                            disabled={deletingUserId === user.id}
                            className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"
                          >
                            {deletingUserId === user.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <p className="text-slate-600">
                Showing {filteredUsers.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, filteredUsers.length)} of {filteredUsers.length} users
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-600">
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={page >= pageCount}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

          {editingUser && form ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-base font-semibold text-slate-900">
                Edit {editingUser.fullName}
              </h2>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  Full name
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    value={form.fullName}
                    onChange={(event) => {
                      setForm((current) =>
                        current ? { ...current, fullName: event.target.value } : current
                      );
                    }}
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Department
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                    value={form.departmentId}
                    onChange={(event) => {
                      setForm((current) =>
                        current ? { ...current, departmentId: event.target.value } : current
                      );
                    }}
                  >
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  Department title
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                    value={form.departmentTitle}
                    onChange={(event) => {
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              departmentTitle: event.target.value as DepartmentTitle,
                            }
                          : current
                      );
                    }}
                  >
                    {departmentTitles.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => {
                      setForm((current) =>
                        current ? { ...current, isActive: event.target.checked } : current
                      );
                    }}
                  />
                  Active user
                </label>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-800">Global roles</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.map((role) => {
                    const checked = form.roleCodes.includes(role.code);
                    return (
                      <label
                        key={role.code}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setForm((current) => {
                              if (!current) return current;

                              const nextRoleCodes = event.target.checked
                                ? Array.from(new Set([...current.roleCodes, role.code]))
                                : current.roleCodes.filter((code) => code !== role.code);

                              return {
                                ...current,
                                roleCodes: nextRoleCodes,
                              };
                            });
                          }}
                        />
                        {role.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void saveUser();
                  }}
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUserId(null);
                    setForm(null);
                  }}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
