// src/routes/auth/session.js

export function registerAuthSessionRoute(app, { resolveSessionAdmin }) {
  app.get("/auth/session", async (req, res) => {
    const admin = await resolveSessionAdmin(req);

    if (!admin) {
      return res.status(401).json({
        authenticated: false,
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        id: String(admin.userId),
        email: admin.email,
        name: admin.name,
      },
      role: admin.role,
    });
  });
}