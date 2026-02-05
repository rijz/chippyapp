import { OverviewMetricsResponse } from '../types';

export const fetchOverviewMetrics = async (
  userId: string,
  accessToken: string,
  days = 7
): Promise<OverviewMetricsResponse | null> => {
  try {
    const response = await fetch(`/api/overview-metrics/${userId}?days=${days}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[OverviewMetrics] Fetch error:', error);
    return null;
  }
};
