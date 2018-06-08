import os
import datetime as dt
from flask import flash, request, render_template, redirect, send_file, url_for
from flask_login import login_required, login_user, logout_user, current_user
from werkzeug.urls import url_parse

from flask import Flask
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy

from app import app, login, db
from models import User
from forms import RegistrationForm, LoginForm, AccountSettingsForm

home_path = os.path.abspath(os.getcwd())
if 'ec2-user' in home_path:
    home_path = '/home/ec2-user/takaomattcom'
par_path = os.path.dirname(home_path)


@app.route('/', methods = ['GET', 'POST'])
def index():
    return render_template('index.html')

@app.route('/bonsai', methods = ['GET', 'POST'])
def bonsai():
    return render_template('bonsai.html')

@app.route('/stocks', methods = ['GET', 'POST'])
@login_required
def stocks():
    d = {'takaoandrew@gmail.com': 25.45,
         'takaomatt@gmail.com': 61.87,
         'mazyyap@gmail.com': 4.31,
         'takaotim@gmail.com': 8.36}
    if current_user.email in d:
        current_user.portfolio_ownership = d[current_user.email]
        db.session.commit()
    stocks_data_dir = par_path + '/capit-vita/data/'
    images = os.listdir(stocks_data_dir)
    today = dt.date.today().strftime('%b %d, %Y')
    portfolio_ownership = current_user.portfolio_ownership
    return render_template('stocks.html', images=images, today=today, portfolio_ownership=portfolio_ownership)

@app.route('/account_settings', methods = ['GET', 'POST'])
@login_required
def account_settings():
    form = AccountSettingsForm()
    if request.method == 'POST':
        current_user.email_frequency = dict(request.form)['frequency'][0]
        db.session.commit()
    return render_template('account_settings.html', form=form)

@app.route('/return-files/')
def return_files():
	try:
		return send_file('static/files/takao-resume.pdf', attachment_filename='takao-resume.pdf')
	except Exception as e:
		return str(e)

@login.user_loader
def load_user(id):
    return User.query.get(int(id))

@app.route('/login', methods = ['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user is None or not user.check_password(form.password.data):
            flash('Invalid username or password')
            return redirect(url_for('login'))
        login_user(user, remember=form.remember_me.data)
        next_page = request.args.get('next')
        if not next_page or url_parse(next_page).netloc != '':
            next_page = url_for('index')
        return redirect(next_page)
    return render_template('login.html', title='Sign In', form=form)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(username=form.username.data, email=form.email.data, portfolio_ownership=0, email_frequency='Weekly')
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash('Congratulations, you are now a registered user!')
        return redirect(url_for('login'))
    return render_template('register.html', title='Register', form=form)

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))
