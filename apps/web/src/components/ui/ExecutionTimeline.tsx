import React from "react";

export interface TimelineEvent {
  id: string;
  status: "success" | "error" | "running" | "pending";
  time?: string;
  title: string;
  description?: string;
  screenshot?: string;
  input?: any;
  output?: any;
}

interface ExecutionTimelineProps {
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

export function ExecutionTimeline({ events, onEventClick }: ExecutionTimelineProps) {
  return (
    <div className="timeline">
      {events.map((event) => (
        <div 
          key={event.id} 
          className={`timeline-item ${event.status}`}
          onClick={() => onEventClick?.(event)}
          style={{ cursor: onEventClick ? 'pointer' : 'default' }}
        >
          {event.time && <div className="timeline-time">{event.time}</div>}
          <div className="timeline-event" style={{ 
            color: event.status === 'pending' ? 'var(--g-text-tertiary)' : 'var(--g-text)'
          }}>
            {event.title}
          </div>
          {event.description && (
            <div style={{ fontSize: '0.85rem', color: 'var(--g-text-secondary)', marginTop: '4px' }}>
              {event.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
