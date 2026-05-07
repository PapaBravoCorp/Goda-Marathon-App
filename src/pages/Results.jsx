import React, { useState, useEffect } from 'react';
import { Search, Download, Filter } from 'lucide-react';
import { getRegistrations } from '../utils/storage';
import { CURRENT_EVENT } from '../utils/constants';

export default function Results() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    setIsLoading(true);
    try {
      const storedData = await getRegistrations(CURRENT_EVENT.id);
      
      const mappedData = storedData.map(r => ({
        bib: r.bib,
        name: `${r.first_name} ${r.last_name}`,
        mockFinishTime: r.mock_finish_time || 'DNS',
        category: r.category
      }));

      // Some mock data to keep the page looking realistic
      const mockResults = [
        { bib: "1001", name: "David Kiprono", mockFinishTime: "2:09:43", category: "Full Marathon" },
        { bib: "1054", name: "Sarah Jenkins", mockFinishTime: "2:24:11", category: "Full Marathon" },
        { bib: "8942", name: "Michael Chen", mockFinishTime: "3:45:22", category: "Full Marathon" },
        { bib: "3321", name: "Elena Rodriguez", mockFinishTime: "1:45:10", category: "Half Marathon" },
        { bib: "5540", name: "James Smith", mockFinishTime: "4:12:05", category: "Full Marathon" },
      ];

      let combined = [...mappedData, ...mockResults];

      const timeToSeconds = (timeStr) => {
        if (timeStr === 'DNS') return Infinity;
        const [h, m, s] = timeStr.split(':').map(Number);
        return (h * 3600) + (m * 60) + (s || 0);
      };

      combined.sort((a, b) => timeToSeconds(a.mockFinishTime) - timeToSeconds(b.mockFinishTime));

      const categoryRanksTracker = {};
      const rankedResults = combined.map(r => {
        if (!categoryRanksTracker[r.category]) {
          categoryRanksTracker[r.category] = 1;
        }
        const rank = r.mockFinishTime === 'DNS' ? '-' : categoryRanksTracker[r.category]++;
        return { ...r, rank };
      });

      setResults(rankedResults);
    } catch (error) {
      console.error("Error fetching results:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = results.filter(r => {
    const matchesSearch = 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      String(r.bib).includes(searchTerm);
    const matchesCategory = categoryFilter ? r.category === categoryFilter : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="section" style={{ minHeight: '80vh', paddingTop: '100px' }}>
      <div className="container">
        <h1 className="text-center" style={{ marginBottom: '16px' }}>Race <span className="accent-text">Results</span></h1>
        <p className="text-center text-muted" style={{ marginBottom: '40px', fontSize: '1.125rem' }}>Look up official times, ranks, and download finish certificates.</p>

        <div className="glass" style={{ maxWidth: '800px', margin: '0 auto 40px auto', padding: '24px', borderRadius: '16px' }}>
          <div className="results-filters">
            <div className="filter-search">
              <Search style={{ position: 'absolute', top: '14px', left: '16px', color: 'var(--color-text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search by Bib or Name..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '50px', borderRadius: '8px', width: '100%' }}
              />
            </div>
            
            <div className="filter-category">
              <Filter style={{ position: 'absolute', top: '14px', left: '16px', color: 'var(--color-text-muted)' }} />
              <select 
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ paddingLeft: '50px', borderRadius: '8px', width: '100%', appearance: 'none', background: 'rgba(255,255,255,0.05)' }}
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

        {/* Mobile Card View */}
        <div className="results-cards">
          {filtered.map((result, i) => (
            <div key={i} className="glass" style={{ padding: '16px 20px', borderRadius: '12px', marginBottom: '12px', borderLeft: '3px solid var(--color-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>#{result.rank}</span>
                <span className="badge badge-primary">{result.bib}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>{result.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>{result.category}</span>
                <span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>{result.mockFinishTime}</span>
              </div>
              {result.mockFinishTime !== 'DNS' && (
                <button className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', marginTop: '10px', width: '100%', justifyContent: 'center' }}>
                  <Download size={14} /> Download Certificate
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="results-table-desktop glass" style={{ borderRadius: '16px', overflow: 'hidden' }}>
          <div className="results-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                  <th style={{ padding: '16px 20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Rank</th>
                  <th style={{ padding: '16px 20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Bib</th>
                  <th style={{ padding: '16px 20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '16px 20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '16px 20px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Time</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 600 }}>Certificate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((result, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--color-border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 800 }}>#{result.rank}</td>
                    <td style={{ padding: '16px 20px' }}><span className="badge badge-primary">{result.bib}</span></td>
                    <td style={{ padding: '16px 20px', fontWeight: 600 }}>{result.name}</td>
                    <td style={{ padding: '16px 20px' }}>{result.category}</td>
                    <td style={{ padding: '16px 20px', color: 'var(--color-primary)', fontWeight: 800 }}>{result.mockFinishTime}</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
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

        {filtered.length === 0 && (
          <div className="results-cards" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No results found.
          </div>
        )}
      </div>
    </div>
  );
}
