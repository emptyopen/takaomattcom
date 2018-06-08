#
# Matt Takao
# created: 2018-01-16
#

import os
import sys
from flask import Flask
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy

home_path = os.path.abspath(os.getcwd())
if 'ec2-user' in home_path:
    home_path = '/home/ec2-user/takaomattcom'
par_path = os.path.dirname(home_path)
sys.path.append(home_path)

app = Flask(__name__)
app.config.from_pyfile('config.py')
db = SQLAlchemy(app)
login = LoginManager(app)
login.login_view = 'login'

from routes import *

db.create_all()

if __name__ == '__main__':

    if os.getcwd() == r'C:\Users\Takkeezi\Documents\python\takaomattcom' or os.getcwd() == '/Users/takaomatt/Documents/python-projects/takaomattcom':
        app.run()
    else:
        app.run(host='0.0.0.0', port = 80)
