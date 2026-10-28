import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string | number;
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataGridProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string;
  searchableKey?: keyof T | ((row: T) => string) | undefined;
  searchPlaceholder?: string | undefined;
  onRowClick?: ((row: T) => void) | undefined;
  selectedRowId?: string | null | undefined;
  expandedRowRender?: ((row: T) => React.ReactNode) | undefined;
  actions?: React.ReactNode | undefined;
  emptyMessage?: string | undefined;
  className?: string | undefined;
}

export function DataGrid<T>({
  data,
  columns,
  keyExtractor,
  searchableKey,
  searchPlaceholder = 'Filter records...',
  onRowClick,
  selectedRowId,
  expandedRowRender,
  actions,
  emptyMessage = 'No records found.',
  className = '',
}: DataGridProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(new Set());

  // Filter
  const filteredData = useMemo(() => {
    if (!search.trim() || !searchableKey) return data;
    const query = search.toLowerCase();
    return data.filter((row) => {
      const val =
        typeof searchableKey === 'function'
          ? searchableKey(row)
          : String((row as any)[searchableKey] || '');
      return val.toLowerCase().includes(query);
    });
  }, [data, search, searchableKey]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const toggleExpand = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    const next = new Set(expandedRowKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedRowKeys(next);
  };

  return (
    <div className={`flex flex-col w-full bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md overflow-hidden ${className}`}>
      {/* Table Toolbar */}
      {(searchableKey || actions) && (
        <div className="flex items-center justify-between p-3 border-b border-[rgba(255,255,255,0.06)] bg-[#0b0d13]/60 gap-4">
          {searchableKey && (
            <div className="relative flex items-center max-w-xs w-full">
              <Search size={13} className="absolute left-2.5 text-[#686b78] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-[#07080c] border border-[rgba(255,255,255,0.06)] rounded text-xs text-[#f4f2ee] placeholder-[#686b78] pl-8 pr-3 py-1.5 outline-none focus:border-[#00c2d4]"
              />
            </div>
          )}
          {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
        </div>
      )}

      {/* Grid Container */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.06)] bg-[#07080c]/50">
              {expandedRowRender && <th className="w-8 px-3 py-2.5" />}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#8e92a4] select-none ${
                    col.sortable ? 'cursor-pointer hover:text-[#f4f2ee]' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <ArrowUpDown
                        size={10}
                        className={sortKey === col.key ? 'text-[#00c2d4]' : 'opacity-40'}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (expandedRowRender ? 1 : 0)}
                  className="px-4 py-8 text-center text-[#686b78] text-xs font-normal"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row, idx) => {
                const rowKey = keyExtractor(row);
                const isSelected = selectedRowId === rowKey;
                const isExpanded = expandedRowKeys.has(rowKey);

                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      onClick={() => onRowClick?.(row)}
                      className={`transition-colors ${
                        onRowClick ? 'cursor-pointer' : ''
                      } ${
                        isSelected
                          ? 'bg-[rgba(0,194,212,0.10)] border-l-2 border-[#00c2d4]'
                          : 'hover:bg-[rgba(255,255,255,0.025)]'
                      }`}
                    >
                      {expandedRowRender && (
                        <td className="w-8 px-2 py-2 text-center text-[#686b78]">
                          <button
                            onClick={(e) => toggleExpand(e, rowKey)}
                            className="p-1 rounded hover:text-[#f4f2ee]"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key} className="px-3 py-2.5 text-xs text-[#f4f2ee]">
                          {col.render ? col.render(row, idx) : (row as any)[col.key]}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && expandedRowRender && (
                      <tr className="bg-[#0b0d13]/80">
                        <td
                          colSpan={columns.length + 1}
                          className="px-6 py-3 border-t border-[rgba(255,255,255,0.04)]"
                        >
                          {expandedRowRender(row)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Grid Footer Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[rgba(255,255,255,0.05)] bg-[#07080c]/50 text-[11px] text-[#686b78]">
        <span>Showing {sortedData.length} records</span>
        {search && <span>Filtered by "{search}"</span>}
      </div>
    </div>
  );
}
