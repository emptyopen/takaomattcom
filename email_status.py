import smtplib
from os.path import basename
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import COMMASPACE, formatdate
import os
from jinja2 import Environment, FileSystemLoader
import datetime as dt

from Robinhood import Robinhood

home_path = os.path.abspath(os.getcwd())
if 'ec2-user' in home_path:
    home_path = '/home/ec2-user/capit-vita'
par_path = os.path.dirname(home_path) + '/'
home_path = home_path + '/'

with open(os.pardir + '/auth/takaomattpython.txt') as f:
    email_password = f.read()

with open(os.pardir + '/auth/robinhood.txt') as f:
    data = f.read().split('\n')
    RH_username = data[0]
    RH_password = data[1]

my_trader = Robinhood()
my_trader.login(username=RH_username, password=RH_password)
equity = my_trader.equity() + 1200

andrew = .2545
matt = .6187
mazy = .0431
tim = .0836

users = {'matt':['Matt', 0.6187, 'takaomatt@gmail.com'],
    'tim':['Tim', 0.0836, 'takaotim@gmail.com'],
    'mazy':['Mazy', 0.0431, 'mazyyap@gmail.com'],
    'andrew':['Andrew', 0.2545, 'takaoandrew@gmail.com']}

mailing_list = ['takaomatt@gmail.com']

with open(os.pardir + '/auth/takaomattpython.txt') as f:
    password = f.read()

def send_email(name, percent_owned, email_address, equity):
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login('takaomattpython@gmail.com', email_password)

    msg = MIMEMultipart()
    msg['Date'] = formatdate(localtime=True)
    now = dt.datetime.now()
    msg['Subject'] = 'Your Portfolio Status for {}-{}-{}'.format(now.year, now.month, now.day)

    # Create the body of the message (a plain-text and an HTML version).
    THIS_DIR = os.path.dirname(os.path.abspath(__file__))
    j2_env = Environment(loader=FileSystemLoader(THIS_DIR),
                         trim_blocks=True)
    html = j2_env.get_template('email_template.html').render(AMOUNT = '${0:,.2f}'.format(equity * percent_owned))
    html = MIMEText(html, 'html')
    #name, percent_owned * 100, equity, round(equity * percent_owned, 2))

    msg.attach(html)

    server.sendmail('takaomattpython@gmail.com', email_address, msg.as_string())
    server.quit()
'''
contents = users['matt']
print(contents)
'''

if True:
    users = {'matt':['Matt', 0.6187, 'takaomatt@gmail.com']}

for user in users:
    contents = users[user]
    send_email(contents[0], contents[1], contents[2], equity)
