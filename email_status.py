import smtplib
from os.path import basename
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.utils import COMMASPACE, formatdate
import os
from jinja2 import Template, FileSystemLoader, Environment
import datetime as dt
import numpy as np
import pandas as pd
import urllib2
import math
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker as mtick
from flask import url_for
import pylab
import sqlite3
from Robinhood import Robinhood

'''
to do
'''


class EmailStatus(object):

    def __init__(self):
        self.home_path = os.path.abspath(os.getcwd())
        if 'ec2-user' in self.home_path:
            self.home_path = '/home/ec2-user/takaomattcom'
            self.par_path = '/home/ec2-user/'
        else:
            self.par_path = os.path.dirname(self.home_path) + '/'
        self.home_path += '/'

        with open(self.par_path + '/auth/robinhood.txt') as f:
            data = f.read().split('\n')
            RH_username = data[0]
            RH_password = data[1]

        with open(self.par_path + '/auth/alphavantage.txt') as f:
            self.av_API = f.read().split('\n')[0]

        self.my_trader = Robinhood()
        self.my_trader.login(username=RH_username, password=RH_password)
        self.equity = self.my_trader.equity()

        conn_users = sqlite3.connect(self.home_path + 'users.db')
        cursor_users = conn_users.cursor()
        self.users = cursor_users.execute("SELECT * FROM user;").fetchall()
        associate = {'takaomatt@gmail.com': 'Matt',
                     'takaotim@gmail.com': 'Tim',
                     'mazyyap@gmail.com': 'Mazy',
                     'takaoandrew@gmail.com': 'Andrew'}
        self.users = {str(x[2]): [associate[x[2]], x[4], str(x[5])]
                      for x in self.users}

    def create_daily_historical_value_plot(self, ownership=1, show=False):

        conn = sqlite3.connect(self.home_path + 'portfolio_history.db')
        cursor = conn.cursor()

        equities = [x[0] * ownership for x in cursor.execute('SELECT equity \
                    FROM portfolio_history \
                    ORDER BY portfolio_date').fetchall()]
        dates = [dt.datetime.strptime(x[0], '%Y-%m-%d')
                 for x in cursor.execute('SELECT portfolio_date \
                                          FROM portfolio_history \
                                          ORDER BY portfolio_date').fetchall()]
        start_date = str(dates[0].date())
        dates = mdates.date2num(dates)
        upper_limit = float(max(equities)) * 1.2

        tries = 0
        url = 'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=SPY&outputsize=full&apikey={}'.format(self.av_API)
        while True:
            request = urllib2.Request(url, headers={'User-Agent': "Magic Browser"})
            temp = eval(urllib2.urlopen(request).read())
            if 'Time Series (Daily)' in temp:
                break  # exit if successful
            else:
                time.sleep(1)
                tries += 1
            if tries > 50:  # in case we're trying too many calls?
                break
        self.df = pd.DataFrame.from_dict(temp['Time Series (Daily)']).transpose()
        mask = self.df.index > start_date
        self.df = self.df.loc[mask]
        SPY_dates = [dt.datetime.strptime(x, '%Y-%m-%d') for x in self.df.index]
        SPY_dates = mdates.date2num(SPY_dates)
        SPY_equities = [float(x) for x in self.df['5. adjusted close']]

        fig, ax = plt.subplots(figsize=(10, 6))
        # fig.suptitle('3-Month Portfolio Value', size='xx-large')

        ax.plot_date(dates, equities, '-', color='#3fcaff', lw=3)

        mondays = mdates.WeekdayLocator(mdates.MONDAY)
        months = mdates.MonthLocator()
        monthsFmt = mdates.DateFormatter("%b")
        ax.xaxis.set_major_locator(months)
        ax.xaxis.set_major_formatter(monthsFmt)
        ax.xaxis.set_minor_locator(mondays)
        ax.xaxis.set_minor_formatter(plt.NullFormatter())
        y_lower = math.floor(min(equities) / 1000) * 1000
        y_upper = math.ceil(max(equities) / 1000) * 1000
        increment = (y_upper - y_lower) / 5
        text_increment = increment * 0.7
        ax.set_yticks(np.arange(y_lower, y_upper, increment))
        ax.yaxis.set_major_formatter(mtick.StrMethodFormatter('${x:,.0f}'))
        ax.set_ylim(0, upper_limit)
        for tick in ax.get_xticklabels():
            tick.set_rotation(20)
        ax.grid(True)

        ratio = equities[0] / SPY_equities[0]
        SPY_relative_equities = [float(x) * ratio for x in SPY_equities]
        ax.plot_date(SPY_dates, SPY_relative_equities, '-', color='#A9A9A9')

        total_change = float(equities[-1]) - float(equities[0])
        total_perc_change = round(float(equities[-1]) / float(equities[0]) * 100 - 100, 1)
        if total_change >= 0:
            total_change = '+${0:,.2f}'.format(total_change)
        else:
            total_change = '-${0:,.2f}'.format(total_change)
        SPY_change = float(self.df['5. adjusted close'][-1]) - float(self.df['5. adjusted close'][0])
        SPY_perc_change = round(float(self.df['5. adjusted close'][-1]) / float(self.df['5. adjusted close'][0]) * 100 - 100, 1)
        if SPY_change >= 0:
            SPY_change = '+${0:,.2f}'.format(SPY_change)
        else:
            SPY_change = '-${0:,.2f}'.format(SPY_change)
        props = dict(boxstyle='round', facecolor='#3fcaff')
        s = '{} ({}%)'.format(total_change, total_perc_change)
        ax.text(dates[7], upper_limit - text_increment, 'Portfolio value', bbox=props)
        ax.text(dates[7] + 33, upper_limit - text_increment, s, color='#3fcaff', weight=750)
        props = dict(boxstyle='round', facecolor='#D3D3D3')
        s = '{} ({}%)'.format(SPY_change, SPY_perc_change)
        ax.text(dates[7], upper_limit - text_increment * 2, 'S&P value', bbox=props)
        ax.text(dates[7] + 33, upper_limit - text_increment * 2, s, color='#A9A9A9', weight=750)
        if SPY_perc_change > total_perc_change:
            s = 'S&P outperforming portfolio by {}%'.format(SPY_perc_change - total_perc_change)
        else:
            s = 'Portfolio outperforming S&P by {}%'.format(total_perc_change - SPY_perc_change)
        props = dict(boxstyle='round', facecolor='#ffffff')
        ax.text(dates[7], upper_limit - text_increment * 3, s, bbox=props)

        if show:
            plt.show()
        else:
            pylab.savefig(self.home_path +
                          'static/img/daily_historical_portfolio.png',
                          facecolor='w', edgecolor='w')
            plt.close()

    def send_email(self, user):

        email_address = user
        name = self.users[user][0]
        percent_owned = self.users[user][1]
        frequency = self.users[user][2]

        msg = MIMEMultipart()
        msg['Date'] = formatdate(localtime=True)
        now = dt.datetime.now()
        s = 'Your {} Portfolio Status ({}-{}-{})'.format(frequency,
                                                         now.year, now.month,
                                                         now.day)
        msg['Subject'] = s

        THIS_DIR = os.path.dirname(os.path.abspath(__file__))
        j2_env = Environment(loader=FileSystemLoader(THIS_DIR),
                             trim_blocks=True)
        daily_img = self.home_path + \
            'static/img/daily_historical_portfolio.png'
        amount = '${0:,.2f}'.format(self.equity * percent_owned)
        html = j2_env.get_template('templates/email_template.html')
        html = html.render(AMOUNT=amount, daily_img=daily_img)
        html = MIMEText(html, 'html')
        msg.attach(html)

        with open(daily_img, 'rb') as f:
            img = MIMEImage(f.read())
        img.add_header('Content-ID', '<daily_historical_portfolio>')
        msg.attach(img)

        self.server.sendmail('takaomattpython@gmail.com', email_address,
                             msg.as_string())
        self.server.quit()

    def send_status_emails(self, force=False):

        with open(self.par_path + '/auth/takaomattpython.txt') as f:
            email_password = f.read()

        # debug
        if True:
            self.users = {'takaomatt@gmail.com': ['Matt', 0.5956, 'Daily'],
                          'takaotim@gmail.com': ['Tim', 0.0805, 'Weekly'],
                          'mazyyap@gmail.com': ['Mazy', 0.0415, 'Weekly'],
                          'takaoandrew@gmail.com': ['Andy', 0.2450, 'Weekly'],
                          'george.asmar.biz@gmail.com': ['George', 0.0373, 'Weekly']}

        if True:
            self.users = {'takaomatt@gmail.com': ['Matt', 0.6187, 'Daily'],
                          'mtblue000@gmail.com': ['Matt', 1, 'Daily']}

        if False:
            self.users = {}

        for user in self.users:
            self.server = smtplib.SMTP('smtp.gmail.com', 587)
            self.server.starttls()
            self.server.login('takaomattpython@gmail.com', email_password)
            self.create_daily_historical_value_plot(self.users[user][1])
            contents = self.users[user]
            # weekly = every monday
            # monthly = first monday of every month
            # quarterly = first monday of January, April, July, October
            send_if = ['Daily']
            today = dt.date.today()
            if today.weekday() == 0:
                send_if.append('Weekly')
            if today.day <= 7 and today.weekday() == 0:
                send_if.append('Monthly')
            if today.month in [1, 4, 7, 10] and today.day <= 7 and \
                    today.weekday() == 0:
                send_if.append('Quarterly')
            if self.users[user][2] in send_if or force:
                print('sending to {}'.format(user))
                self.send_email(user)
            if os.path.isfile('static/img/daily_historical_portfolio.png'):
                os.remove('static/img/daily_historical_portfolio.png')


E = EmailStatus()
E.send_status_emails()
#E.create_daily_historical_value_plot(show=True)
