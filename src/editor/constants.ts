
export const RegUUID = 
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const defaultDemoNote =  {
  id: 'ea3c58dm-ba42-4c24-9d59-409eacd1demo',
  title: 'demo note',
  content: '',
  file_path: '00000000-0000-0000-0000-000000000000',
  cover: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_pub: false,
  is_wiki: false,
  is_daily: false,
};
