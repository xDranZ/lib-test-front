"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AuthUser = {
  id: string;
  name: string;
  role: string;
  email: string;
};

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type BookCopy = {
  id: string;
  status: string;
  book?: {
    id: string;
    title: string;
    genre: string;
    author: string;
  };
  ownerUser?: AuthUser;
};

type LoanRequest = {
  id: string;
  status: string;
  requestMessage: string;
  responseMessage?: string;
  requestedAt: string;
  requesterUser?: AuthUser;
  bookCopy?: BookCopy;
};

type Penalty = {
  id: string;
  paidAt?: string | null;
  reason: string;
  penaltyType?: {
    name: string;
    defaultAmount: string;
  };
};

type StudentStatus = {
  blocked: boolean;
  reason: string | null;
  pendingPenaltiesCount: number;
};

type Tab = "books" | "available" | "requests" | "penalties" | "admin";

const API_BASE = "/backend";

export default function Home() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [activeTab, setActiveTab] = useState<Tab>("books");
  const [status, setStatus] = useState<StudentStatus | null>(null);
  const [myBooks, setMyBooks] = useState<BookCopy[]>([]);
  const [availableBooks, setAvailableBooks] = useState<BookCopy[]>([]);
  const [requests, setRequests] = useState<LoanRequest[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bookForm, setBookForm] = useState({
    title: "",
    genre: "",
    author: "",
  });
  const [userForm, setUserForm] = useState({
    name: "",
    role: "students",
    email: "",
    password: "",
  });

  const isAdmin = user?.role === "admin";
  const isStudent = user?.role === "students" || user?.role === "student";

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  useEffect(() => {
    const storedToken = localStorage.getItem("library_token");
    const storedUser = localStorage.getItem("library_user");

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (!token || !isStudent) return;
    refreshStudentData();
  }, [token, isStudent]);

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    setError("");
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.message ?? "La solicitud fallo");
    }

    return data as T;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    try {
      const data = await request<LoginResponse>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      setToken(data.accessToken);
      setUser(data.user);
      localStorage.setItem("library_token", data.accessToken);
      localStorage.setItem("library_user", JSON.stringify(data.user));
      setMessage(`Sesion iniciada como ${data.user.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion");
    }
  }

  function logout() {
    setToken("");
    setUser(null);
    setStatus(null);
    localStorage.removeItem("library_token");
    localStorage.removeItem("library_user");
  }

  async function refreshStudentData() {
    try {
      const nextStatus = await request<StudentStatus>("/student/status", {
        headers: authHeaders,
      });
      setStatus(nextStatus);
      setPenalties(
        await request<Penalty[]>("/student/penalties", { headers: authHeaders }),
      );

      if (!nextStatus.blocked) {
        const [books, available, received] = await Promise.all([
          request<BookCopy[]>("/student/books", { headers: authHeaders }),
          request<BookCopy[]>("/student/available-book-copies", {
            headers: authHeaders,
          }),
          request<LoanRequest[]>("/student/loan-requests/received", {
            headers: authHeaders,
          }),
        ]);
        setMyBooks(books);
        setAvailableBooks(available);
        setRequests(received);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar datos");
    }
  }

  async function addBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await request<BookCopy>("/student/books", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(bookForm),
      });
      setBookForm({ title: "", genre: "", author: "" });
      setMessage("Libro agregado");
      await refreshStudentData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar libro");
    }
  }

  async function requestBook(bookCopyId: string) {
    try {
      await request<LoanRequest>("/student/loan-requests", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          bookCopyId,
          requestMessage: "Hola, me puedes prestar este libro?",
        }),
      });
      setMessage("Solicitud enviada");
      await refreshStudentData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo solicitar");
    }
  }

  async function respondRequest(requestId: string, statusValue: "approved" | "rejected") {
    try {
      await request(`/student/loan-requests/${requestId}/respond`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          status: statusValue,
          responseMessage:
            statusValue === "approved" ? "Solicitud aprobada" : "Solicitud rechazada",
          dueDate: statusValue === "approved" ? nextMonthDate() : undefined,
          deliveryCode: statusValue === "approved" ? "123456" : undefined,
          returnCode: statusValue === "approved" ? "654321" : undefined,
        }),
      });
      setMessage("Solicitud respondida");
      await refreshStudentData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo responder");
    }
  }

  async function payPenalty(id: string) {
    try {
      await request(`/student/penalties/${id}/pay`, {
        method: "PATCH",
        headers: authHeaders,
      });
      setMessage("Penalizacion pagada");
      await refreshStudentData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo pagar");
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await request("/users", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(userForm),
      });
      setUserForm({ name: "", role: "students", email: "", password: "" });
      setMessage("Usuario creado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear usuario");
    }
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f5f7f8] text-slate-950">
        <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase text-teal-700">Library</p>
            <h1 className="mt-2 text-3xl font-semibold">Iniciar sesion</h1>
            <p className="mt-2 text-sm text-slate-600">
              Usa el usuario admin o un estudiante creado desde la API.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 rounded-lg border bg-white p-5">
            <label className="block text-sm font-medium">
              Email
              <input
                className="mt-2 w-full rounded-md border px-3 py-2"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                className="mt-2 w-full rounded-md border px-3 py-2"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="w-full rounded-md bg-slate-950 px-4 py-2 font-medium text-white">
              Entrar
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7f8] text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium text-teal-700">Library</p>
            <h1 className="text-xl font-semibold">{user.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-md border px-2 py-1 text-sm">{user.role}</span>
            <button className="rounded-md border px-3 py-2 text-sm" onClick={logout}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-6">
        {message && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
        {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        {isStudent && (
          <div className="mb-4 rounded-lg border bg-white p-4">
            <p className="text-sm text-slate-600">Estado</p>
            <p className="mt-1 font-medium">
              {status?.blocked
                ? `Bloqueado por ${status.pendingPenaltiesCount} penalizacion pendiente`
                : "Disponible para operar"}
            </p>
          </div>
        )}

        <nav className="mb-5 flex flex-wrap gap-2">
          {isStudent &&
            tabButton("books", "Mis libros", activeTab, setActiveTab)}
          {isStudent &&
            tabButton("available", "Disponibles", activeTab, setActiveTab)}
          {isStudent &&
            tabButton("requests", "Solicitudes", activeTab, setActiveTab)}
          {isStudent &&
            tabButton("penalties", "Penalizaciones", activeTab, setActiveTab)}
          {isAdmin && tabButton("admin", "Crear usuarios", activeTab, setActiveTab)}
        </nav>

        {activeTab === "books" && isStudent && (
          <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <form onSubmit={addBook} className="h-fit rounded-lg border bg-white p-4">
              <h2 className="font-semibold">Agregar libro</h2>
              <Field label="Titulo" value={bookForm.title} onChange={(title) => setBookForm({ ...bookForm, title })} />
              <Field label="Genero" value={bookForm.genre} onChange={(genre) => setBookForm({ ...bookForm, genre })} />
              <Field label="Autor" value={bookForm.author} onChange={(author) => setBookForm({ ...bookForm, author })} />
              <button className="mt-4 w-full rounded-md bg-slate-950 px-4 py-2 text-white">
                Guardar
              </button>
            </form>
            <List title="Mis copias">
              {myBooks.map((copy) => (
                <BookRow key={copy.id} copy={copy} />
              ))}
            </List>
          </section>
        )}

        {activeTab === "available" && isStudent && (
          <List title="Libros disponibles de otros estudiantes">
            {availableBooks.map((copy) => (
              <BookRow
                key={copy.id}
                copy={copy}
                actionLabel="Solicitar"
                onAction={() => requestBook(copy.id)}
              />
            ))}
          </List>
        )}

        {activeTab === "requests" && isStudent && (
          <List title="Solicitudes recibidas">
            {requests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 border-b py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{request.bookCopy?.book?.title}</p>
                  <p className="text-sm text-slate-600">
                    {request.requesterUser?.name}: {request.requestMessage}
                  </p>
                  <p className="mt-1 text-sm">Estado: {request.status}</p>
                </div>
                {request.status === "pending" && (
                  <div className="flex gap-2">
                    <button className="rounded-md bg-slate-950 px-3 py-2 text-sm text-white" onClick={() => respondRequest(request.id, "approved")}>
                      Aprobar
                    </button>
                    <button className="rounded-md border px-3 py-2 text-sm" onClick={() => respondRequest(request.id, "rejected")}>
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </List>
        )}

        {activeTab === "penalties" && isStudent && (
          <List title="Mis penalizaciones">
            {penalties.map((penalty) => (
              <div key={penalty.id} className="flex flex-col gap-3 border-b py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{penalty.penaltyType?.name ?? "Penalizacion"}</p>
                  <p className="text-sm text-slate-600">{penalty.reason}</p>
                  <p className="mt-1 text-sm">{penalty.paidAt ? "Pagada" : "Pendiente"}</p>
                </div>
                {!penalty.paidAt && (
                  <button className="rounded-md bg-slate-950 px-3 py-2 text-sm text-white" onClick={() => payPenalty(penalty.id)}>
                    Marcar pagada
                  </button>
                )}
              </div>
            ))}
          </List>
        )}

        {activeTab === "admin" && isAdmin && (
          <form onSubmit={createUser} className="max-w-md rounded-lg border bg-white p-4">
            <h2 className="font-semibold">Crear usuario</h2>
            <Field label="Nombre" value={userForm.name} onChange={(name) => setUserForm({ ...userForm, name })} />
            <Field label="Rol" value={userForm.role} onChange={(role) => setUserForm({ ...userForm, role })} />
            <Field label="Email" value={userForm.email} onChange={(emailValue) => setUserForm({ ...userForm, email: emailValue })} />
            <Field label="Password" type="password" value={userForm.password} onChange={(nextPassword) => setUserForm({ ...userForm, password: nextPassword })} />
            <button className="mt-4 w-full rounded-md bg-slate-950 px-4 py-2 text-white">
              Crear
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function tabButton(
  tab: Tab,
  label: string,
  activeTab: Tab,
  setActiveTab: (tab: Tab) => void,
) {
  return (
    <button
      className={`rounded-md px-3 py-2 text-sm ${
        activeTab === tab ? "bg-slate-950 text-white" : "border bg-white"
      }`}
      onClick={() => setActiveTab(tab)}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="mt-4 block text-sm font-medium">
      {label}
      <input
        className="mt-2 w-full rounded-md border px-3 py-2"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function List({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2">
        {Array.isArray(children) && children.length === 0 ? (
          <p className="py-8 text-sm text-slate-600">Sin registros</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function BookRow({
  copy,
  actionLabel,
  onAction,
}: {
  copy: BookCopy;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-medium">{copy.book?.title}</p>
        <p className="text-sm text-slate-600">
          {copy.book?.author} · {copy.book?.genre}
        </p>
        <p className="mt-1 text-sm">
          {copy.status}
          {copy.ownerUser ? ` · ${copy.ownerUser.name}` : ""}
        </p>
      </div>
      {actionLabel && (
        <button className="rounded-md bg-slate-950 px-3 py-2 text-sm text-white" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function nextMonthDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}
