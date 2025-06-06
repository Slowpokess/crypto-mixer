import React from 'react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, DollarSign, Server } from 'lucide-react';

const OverviewTab = ({ stats, transactions, systemHealth }) => {
  const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B'];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Volume (24h)</p>
              <p className="text-2xl font-bold">${stats?.volume24h?.toLocaleString() || '0'}</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Active Mixes</p>
              <p className="text-2xl font-bold">{stats?.activeMixes || 0}</p>
            </div>
            <Activity className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Fees (24h)</p>
              <p className="text-2xl font-bold">${stats?.fees24h?.toLocaleString() || '0'}</p>
            </div>
            <DollarSign className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">System Health</p>
              <p className="text-2xl font-bold text-green-400">
                {systemHealth?.status === 'healthy' ? 'Healthy' : 'Issues'}
              </p>
            </div>
            <Server className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4">Volume Trend (7 days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats?.volumeTrend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1F2937', border: 'none' }}
                labelStyle={{ color: '#9CA3AF' }}
              />
              <Line type="monotone" dataKey="volume" stroke="#8B5CF6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4">Currency Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats?.currencyDistribution || []}
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                label
              >
                {(stats?.currencyDistribution || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % 4]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Recent Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm">
                <th className="pb-4">ID</th>
                <th className="pb-4">Currency</th>
                <th className="pb-4">Amount</th>
                <th className="pb-4">Status</th>
                <th className="pb-4">Created</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {transactions.slice(0, 10).map((tx) => (
                <tr key={tx.id} className="border-t border-gray-700">
                  <td className="py-3 font-mono">{tx.id.substring(0, 8)}...</td>
                  <td className="py-3">{tx.currency}</td>
                  <td className="py-3">{tx.amount}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      tx.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                      tx.status === 'PROCESSING' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-3">{new Date(tx.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;