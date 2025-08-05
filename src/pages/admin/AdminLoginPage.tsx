import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function AdminLoginPage() {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const DUMMY_ADMIN = {
        id: 'admin',
        pw: 'admin',
    };    
    
    try {
    //   const response = await axios.post('/admin/login', {
    //     username: id,
    //     password,
    //   });

    //   const { token } = response.data;
    //   localStorage.setItem('admin_token', token);
        if (id === DUMMY_ADMIN.id && password === DUMMY_ADMIN.pw) {
          toast.success('로그인 성공');
          
          localStorage.setItem('admin-auth', 'true');
          navigate('/admin/products');
        } else {
          toast.error('아이디 또는 비밀번호가 잘못되었습니다.');
        }
    } catch (err: any) {
      setError('로그인에 실패했습니다. ID/PW를 확인해주세요.');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">관리자 로그인</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">ID</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-orange-400 focus:border-orange-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-orange-400 focus:border-orange-400"
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            className="w-full bg-orange-400 text-white py-2 rounded hover:bg-orange-500"
          >
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}
