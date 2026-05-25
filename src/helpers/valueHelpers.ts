export const getPercentValue = (
  { min, max }: { min: number; max: number },
  percent: number
) => max - (max - min) * percent;
