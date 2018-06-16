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

        with open(self.par_path + '/auth/takaomattpython.txt') as f:
            email_password = f.read()

        with open(self.par_path + '/auth/robinhood.txt') as f:
            data = f.read().split('\n')
            RH_username = data[0]
            RH_password = data[1]

        self.my_trader = Robinhood()
        self.my_trader.login(username=RH_username, password=RH_password)
        self.equity = self.my_trader.equity()

        self.server = smtplib.SMTP('smtp.gmail.com', 587)
        self.server.starttls()
        self.server.login('takaomattpython@gmail.com', email_password)

        conn_users = sqlite3.connect(self.home_path + 'users.db')
        cursor_users = conn_users.cursor()
        self.users = cursor_users.execute("SELECT * FROM user;").fetchall()
        associate = {'takaomatt@gmail.com':'Matt', 'takaotim@gmail.com':'Tim', 'mazyyap@gmail.com':'Mazy', 'takaoandrew@gmail.com':'Andrew'}
        self.users = {str(x[2]):[associate[x[2]], x[4], str(x[5])] for x in self.users}


    def create_daily_historical_value_plot(self, ownership=1):

        conn = sqlite3.connect(self.home_path + 'portfolio_history.db')
        cursor = conn.cursor()

        equities = [x[0] * ownership for x in cursor.execute('SELECT equity FROM portfolio_history ORDER BY portfolio_date').fetchall()]
        dates = [dt.datetime.strptime(x[0], '%Y-%m-%d') for x in cursor.execute('SELECT portfolio_date FROM portfolio_history ORDER BY portfolio_date').fetchall()]
        dates = mdates.date2num(dates)
        upper_limit = float(max(equities)) * 1.2
        total_change = float(equities[-1]) - float(equities[0])
        if total_change >= 0:
            total_change = '+${0:,.2f}'.format(total_change)
        else:
            total_change = '-${0:,.2f}'.format(total_change)

        fig, ax = plt.subplots(figsize = (10, 6))
        #fig.suptitle('3-Month Portfolio Value', size='xx-large')

        ax.plot_date(dates, equities, '-', color='#3fcaff', lw=3)
        props = dict(boxstyle='round', facecolor='#3fcaff', alpha=0.7)
        ax.text(dates[7], float(equities[-1]), 'Total change: {}'.format(total_change), bbox=props)

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
        ax.set_yticks(np.arange(y_lower, y_upper, increment))
        ax.yaxis.set_major_formatter(mtick.StrMethodFormatter('${x:,.0f}'))
        ax.set_ylim(0, upper_limit)
        for tick in ax.get_xticklabels():
            tick.set_rotation(20)
        ax.grid(True)

        if False:
            plt.show()
        else:
            pylab.savefig(self.home_path + 'static/img/daily_historical_portfolio.png', facecolor='w', edgecolor='w')
            plt.close()


    def send_email(self, user):

        email_address = user
        name = self.users[user][0]
        percent_owned = self.users[user][1]
        frequency = self.users[user][2]

        msg = MIMEMultipart()
        msg['Date'] = formatdate(localtime=True)
        now = dt.datetime.now()
        msg['Subject'] = 'Your {} Portfolio Status ({}-{}-{})'.format(frequency, now.year, now.month, now.day)

        THIS_DIR = os.path.dirname(os.path.abspath(__file__))
        j2_env = Environment(loader=FileSystemLoader(THIS_DIR), trim_blocks=True)
        daily_img = self.home_path + 'static/img/daily_historical_portfolio.png'
        html = j2_env.get_template('templates/email_template.html').render(AMOUNT = '${0:,.2f}'.format(self.equity * percent_owned), daily_img=daily_img)
        html = MIMEText(html, 'html')
        msg.attach(html)

        with open(daily_img, 'rb') as f:
            img = MIMEImage(f.read())
        img.add_header('Content-ID', '<daily_historical_portfolio>')
        msg.attach(img)

        self.server.sendmail('takaomattpython@gmail.com', email_address, msg.as_string())
        self.server.quit()


    def send_status_emails(self, force=False):

        # debug
        if True:
            self.users = {'takaomatt@gmail.com':['Matt', 0.6187, 'Daily'],
                          'takaotim@gmail.com':['Tim', 0.0836, 'Weekly'],
                          'mazyyap@gmail.com':['Mazy', 0.0431, 'Weekly'],
                          'takaoandrew@gmail.com':['Andrew', 0.2545, 'Weekly']}

        if False:
            self.users = {'takaomatt@gmail.com':['Matt', 0.6187, 'Daily']}

        if False:
            self.users = {}

        for user in self.users:
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
            if today.month in [1, 4, 7, 10] and today.day <= 7 and today.weekday() == 0:
                send_if.append('Quarterly')
            if self.users[user][2] in send_if or force:
                print('sending to {}'.format(user))
                self.send_email(user)
            if os.path.isfile('static/img/daily_historical_portfolio.png'):
                os.remove('static/img/daily_historical_portfolio.png')




E = EmailStatus()
E.send_status_emails()
