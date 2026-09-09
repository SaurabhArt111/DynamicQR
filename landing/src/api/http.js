import axios from 'axios';
const API_URL=import.meta.env.VITE_API_URL||'http://localhost:5000/api';
export const api=axios.create({baseURL:API_URL,timeout:20000});
export function fileUrl(path){if(!path)return '';if(/^https?:\/\//i.test(path))return path;return `${API_URL.replace(/\/api\/?$/,'')}${path.startsWith('/')?path:`/${path}`}`;}
export function getErrorMessage(error,fallback='Something went wrong.') { return error.response?.data?.message || error.message || fallback; }
