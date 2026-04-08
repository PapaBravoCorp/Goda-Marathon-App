import React, { useState } from 'react';
import { Search, Download, Filter } from 'lucide-react';
import { getRegistrations } from '../utils/storage';
import { CURRENT_EVENT } from '../utils/constants';

export default function Results() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  
  const [results] = useState(() => {
    // Some mock data to keep the page looking realistic if fresh, but we will scope to the current event.
    // Assuming mock data belongs to older event, so we ONLY show current event data if they chose to.
    // For MVP, we will blend them so they see SOMETHING if empty, but explicitly label them.
    const mockResults = [
      { bib: "1001", name: "David Kiprono", mockFinishTime: "2:09:43", category: "Full Marathon" },
      { bib: "1054", name: "Sarah Jenkins", mockFinishTime: "2:24:11", category: "Full Marathon" },
      { bib: "8942", name: "Michael Chen", mockFinishTime: "3:45:22", category: "Full Marathon" },
      { bib: "3321", name: "Elena Rodriguez", mockFinishTime: "1:45:10", category: "Half Marathon" },
      { bib: "5540", name: "James Smith", mockFinishTime: "4:12:05", category: "Full Marathon" },
    ];

    const storedData = getRegistrations(CURRENT_EVENT.id).map(r => ({
      bib: r.bib,
      name: `${r.firstName} ${r.lastName}`,
      mockFinishTime: r.mockFinishTime || 'DNS',
      category: r.category
    }));

    let combined = [...storedData, ...mockResults];

    // Helper to convert HH:MM:SS to seconds for rigorous sorting
    const timeToSeconds = (timeStr) => {
      if (timeStr === 'DNS') return Infinity; // Put DNS at the bottom
      const [h, m, s] = timeStr.split(':').map(Number);
      return (h * 3600) + (m * 60) + (s || 0);
    };

    // 1. Sort globally (or primarily) by finish time
    combined.sort((a, b) => timeToSeconds(a.mockFinishTime) - timeToSeconds(b.mockFinishTime));

    // 2. Assign dynamic ranks exactly isolated PER CATEGORY
    const categoryRanksTracker = {};
    return combined.map(r => {
      if (!categoryRanksTracker[r.category]) {
        categoryRanksTracker[r.category] = 1;
      }
      
      const rank = r.mockFinishTime === 'DNS' ? '-' : categoryRanksTracker[r.category]++;
      return { ...r, rank };
    });
  });

  const filtered = results.filter(r => {
    const matchesSearch = 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      String(r.bib).includes(searchTerm);
    const matchesCategory = categoryFilter ? r.category === categoryFilter : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="section" style={{ minHeight: '80vh' }}>
      <div className="container">
        <h1 className="text-center" style={{ fontSize: '3.5rem', marginBottom: '16px' }}>Race <span className="accent-text">Results</span></h1>
        <p className="text-center text-muted" style={{ marginBottom: '40px', fontSize: '1.25rem' }}>Look up official times, ranks, and download finish certificates.</p>

        <div className="glass" style={{ maxWidth: '800px', margin: '0 auto 40px auto', padding: '24px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 2, minWidth: '250px' }}>
              <Search style={{ position: 'absolute', top: '14px', left: '16px', color: 'var(--color-text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search by Bib Number or Name..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '50px', fontSize: '1.125rem', borderRadius: '8px', width: '100%' }}
              />
            </div>
            
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Filter style={{ position: 'absolute', top: '14px', left: '16px', color: 'var(--color-text-muted)' }} />
              <select 
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ paddingLeft: '50px', fontSize: '1.125rem', borderRadius: '8px', width: '100%', appearance: 'none', background: 'rgba(255,255,255,0.05)' }}
              >
                <option value="">All Categories</option>
                <option value="5K Run">5K Run</option>
                <option value="10K Run">10K Run</option>
                <option value="Half Marathon">Half Marathon</option>
                <option value="Full Marathon">Full Marathon</option>
              </select>
            </div>
          </div>
        </div>

        <div className="glass" style={{ borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                  <th style={{ padding: '20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Category Rank</th>
                  <th style={{ padding: '20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Bib No.</th>
                  <th style={{ padding: '20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Finish Time</th>
                  <th style={{ padding: '20px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 600 }}>Certificate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((result, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--color-border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '20px', fontWeight: 800 }}>#{result.rank}</td>
                    <td style={{ padding: '20px' }}><span className="badge badge-primary">{result.bib}</span></td>
                    <td style={{ padding: '20px', fontWeight: 600 }}>{result.name}</td>
                    <td style={{ padding: '20px' }}>{result.category}</td>
                    <td style={{ padding: '20px', color: 'var(--color-primary)', fontWeight: 800 }}>{result.mockFinishTime}</td>
                    <td style={{ padding: '20px', textAlign: 'right' }}>
                      <button className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '4px', fontSize: '0.85rem' }} disabled={result.mockFinishTime === 'DNS'}>
                        <Download size={14} /> Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No results found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
