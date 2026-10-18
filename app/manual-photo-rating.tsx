"use client";

import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVITY_RATINGS, type ActivityRating } from '@/lib/activity-rating';

type Props = {
  groupName: string;
  number: number;
  rating: ActivityRating | null;
  busy: boolean;
  onRatingChange: (rating: ActivityRating) => void;
  onOpen: () => void;
};

export function ManualPhotoRating({ groupName, number, rating, busy, onRatingChange, onOpen }: Props) {
  return <div className="manual-photo-rating">
    <span className="manual-photo-rating-label">{groupName} · 第 {number} 次活动</span>
    <div className="manual-photo-rating-controls">
      <Select value={rating ?? undefined} onValueChange={value => onRatingChange(value as ActivityRating)} disabled={busy}>
        <SelectTrigger aria-label={`${groupName}第${number}次活动等次`} className="manual-photo-rating-select"><SelectValue placeholder="手动填写等次" /></SelectTrigger>
        <SelectContent>{(Object.keys(ACTIVITY_RATINGS) as ActivityRating[]).map(value => <SelectItem key={value} value={value}>{ACTIVITY_RATINGS[value].label} · {ACTIVITY_RATINGS[value].rate * 100}%</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={busy} onClick={onOpen}>核对成绩<ChevronRight size={14} /></Button>
    </div>
  </div>;
}
