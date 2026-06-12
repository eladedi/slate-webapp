import type { User } from "../types";

/**
 * Small circular avatar — Google `photoUrl` when present, otherwise a colored
 * initial chip with hue derived from `uid.hashCode() % 360` so each member has
 * a stable, distinct fallback color. Mirrors mobile §24 `AssigneeAvatar`.
 */
export function Avatar({
  user,
  uid,
  size = 24,
  title,
}: {
  user?: User | null;
  uid: string;
  size?: number;
  title?: string;
}) {
  const photo = user?.photoUrl ?? null;
  const initial = (user?.displayName || user?.email || uid).trim().charAt(0).toUpperCase();
  const hue = hueFromUid(uid);
  const ttl = title ?? user?.displayName ?? user?.email ?? "";

  if (photo) {
    return (
      <img
        src={photo}
        alt={ttl}
        title={ttl}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          objectFit: "cover",
          flexShrink: 0,
          border: "1px solid var(--surface)",
          boxShadow: "0 0 0 1px var(--outline-variant)",
        }}
        referrerPolicy="no-referrer"
        onError={(e) => {
          // Hide broken Google avatars (common when the user revoked the URL).
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      title={ttl}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `hsl(${hue}, 55%, 78%)`,
        color: `hsl(${hue}, 60%, 22%)`,
        fontSize: Math.max(10, Math.floor(size * 0.48)),
        fontWeight: 600,
        flexShrink: 0,
        border: "1px solid #fff",
        boxShadow: "0 0 0 1px rgba(58,47,37,0.08)",
        userSelect: "none",
      }}
    >
      {initial || "?"}
    </div>
  );
}

/**
 * Horizontal stack of avatars (max `max` shown; remaining count rendered as a
 * "+N" chip). Right-to-left stacking via `flexDirection: row-reverse` so the
 * first member sits at the visually-leading edge under RTL.
 */
export function AvatarStack({
  uids,
  profiles,
  size = 22,
  max = 3,
}: {
  uids: string[];
  profiles: Map<string, User>;
  size?: number;
  max?: number;
}) {
  if (uids.length === 0) return null;
  const visible = uids.slice(0, max);
  const overflow = uids.length - visible.length;
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center" }}>
      {overflow > 0 && (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            background: "var(--surface-low)",
            color: "var(--on-surface-variant)",
            fontSize: Math.max(9, Math.floor(size * 0.42)),
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginInlineEnd: -size / 4,
            border: "1px solid var(--surface)",
            boxShadow: "0 0 0 1px var(--outline-variant)",
          }}
          title={`עוד ${overflow}`}
        >
          +{overflow}
        </div>
      )}
      {visible.map((u, i) => (
        <div key={u} style={{ marginInlineEnd: i === visible.length - 1 ? 0 : -size / 4 }}>
          <Avatar user={profiles.get(u)} uid={u} size={size} />
        </div>
      ))}
    </div>
  );
}

function hueFromUid(uid: string): number {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
