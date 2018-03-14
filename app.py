# Matt Takao 2018-01-19

# initialize app

from flask import Flask
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

app.config.from_pyfile('config.py')
app.secret_key = 'hireMattTakaoX98dd3a098spz9rt'

db = SQLAlchemy(app)
