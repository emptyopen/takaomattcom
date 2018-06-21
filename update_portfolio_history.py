import datetime as dt
import sqlite3
import os
from Robinhood import Robinhood

home_path = os.path.abspath(os.getcwd())
if 'ec2-user' in home_path:
    home_path = '/home/ec2-user/takaomattcom'
par_path = os.path.dirname(home_path)
home_path += '/'

with open(par_path + '/auth/robinhood.txt') as f:
    contents = f.read().split('\n')
    robinhood_username = contents[0]
    robinhood_password = contents[1]

my_trader = Robinhood()
my_trader.login(username=robinhood_username, password=robinhood_password)
equity = my_trader.equity()

now = dt.datetime.now()
now_date = '{}-{}-{}'.format(now.year, '{:02d}'.format(now.month),
                             '{:02d}'.format(now.day))

conn = sqlite3.connect(home_path + 'portfolio_history.db')
cursor = conn.cursor()

#cursor.execute('DROP TABLE portfolio_history')
#cursor.execute('CREATE TABLE portfolio_history (portfolio_date date, equity real)')
#cursor.execute('INSERT INTO portfolio_history VALUES (?, ?)', (row[0], row[1]))

vals = cursor.execute('SELECT portfolio_date, equity FROM portfolio_history \
                       WHERE portfolio_date=?', (now_date, )).fetchall()
if len(vals) == 0:
    cursor.execute('INSERT INTO portfolio_history VALUES (?, ?)',
                   (now_date, equity))
    conn.commit()
