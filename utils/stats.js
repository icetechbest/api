function computeStats(sections) {
  const totalEndpoints = sections.reduce((sum, s) => sum + s.endpoints.length, 0);
  const distribution = sections
    .map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      count: s.endpoints.length,
      pct: totalEndpoints ? Math.round((s.endpoints.length / totalEndpoints) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalEndpoints,
    totalSections: sections.length,
    dominant: distribution[0] || null,
    distribution
  };
}

// Shared by GET /api/info (raw JSON) and GET /console (JSON panel on the page)
// so the two never drift apart.
function buildSiteInfo(sections, siteName) {
  const stats = computeStats(sections);
  return {
    name: siteName,
    domain: process.env.SITE_DOMAIN || null,
    version: '1.0.0',
    status: 'online',
    stats: {
      total_endpoints: stats.totalEndpoints,
      total_sections: stats.totalSections
    },
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      endpoints: s.endpoints.map((e) => ({ method: e.method, path: e.path, title: e.title }))
    }))
  };
}

module.exports = { computeStats, buildSiteInfo };
