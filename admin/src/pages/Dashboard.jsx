import { useEffect, useState } from 'react';
import { Activity, Database, QrCode } from 'lucide-react';
import { api } from '../api/http.js';
import { formatBytes, formatDate } from '../utils/format.js';
import './Dashboard.css';

const ACTION_LABELS = {
  QR_CREATED: 'QR Created',
  QR_MODIFIED: 'QR Modified',
  QR_DELETED: 'QR Recycled',
  QR_RESTORED: 'QR Restored',
  QR_PURGED: 'QR Deleted'
};

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then((res) => setData(res.data));
  }, []);

  const cards = [
    ['Total QR Codes', data?.totalQrCodes ?? 0, QrCode],
    ['Active QR Codes', data?.activeQrCodes ?? 0, Activity],
    ['Total Collections', data?.totalCollections ?? 0, Database],
    ['Storage Usage', formatBytes(data?.storageUsageBytes || 0), Database]
  ];

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Operational overview for every dynamic QR in the vault.</p>
        </div>
      </div>
      <div className="metric-grid metric-grid-4">
        {cards.map(([label, value, Icon]) => (
          <article className="metric-card" key={label}>
            <Icon size={22} />
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <section className="activity-panel">
        <h2>Recent Activity</h2>
        <div className="activity-list">
          {(data?.recentActivity || []).map((item) => (
            <div className="activity-item" key={item._id}>
              <div className="activity-item-info">
                <span className={`activity-badge action-${item.action}`}>{ACTION_LABELS[item.action] || item.action}</span>
                <strong>{item.message}</strong>
              </div>
              <span className="activity-time">{formatDate(item.createdAt)}</span>
            </div>
          ))}
          {data?.recentActivity?.length === 0 && <p className="activity-empty">No activity yet.</p>}
          {!data && <p className="activity-empty">Loading...</p>}
        </div>
      </section>
    </section>
  );
}
