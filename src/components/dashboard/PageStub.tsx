export default function PageStub({
  eyebrow = 'Coming soon',
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="dash-section" style={{ marginTop: 12, textAlign: 'center', padding: '48px 24px' }}>
      <div
        className="dash-page-eyebrow"
        style={{ marginBottom: 6 }}
      >
        {eyebrow}
      </div>
      <h2 className="dash-section-title" style={{ marginBottom: 8, fontSize: 22 }}>
        {title}
      </h2>
      {body && (
        <p style={{ color: 'var(--ts)', maxWidth: 480, margin: '0 auto', fontSize: 14 }}>
          {body}
        </p>
      )}
    </div>
  );
}
