#
# Matt Takao
# 2018-01-16
# last modified 2018-01-21
#

# to-do:
#
# ready to submit!
#

import datetime as dt
import os
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib

from flask import Flask, flash, request, render_template, redirect, send_file, url_for, abort
from flask_login import LoginManager, UserMixin, login_required, login_user, logout_user, current_user
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import ValidationError, DataRequired, Email, EqualTo
from sqlalchemy import or_
from flask_sqlalchemy import SQLAlchemy

from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.urls import url_parse

from Robinhood import Robinhood


app = Flask(__name__)
app.config.from_pyfile('config.py')
db = SQLAlchemy(app)
login = LoginManager(app)
login.login_view = 'login'

home_path = os.path.abspath(os.getcwd())
if 'ec2-user' in home_path:
    home_path = '/home/ec2-user/takaomattcom'
par_path = os.path.dirname(home_path)

RUN_APP = False

with open(par_path + '/auth/robinhood.txt') as f:
    contents = f.read().split('\n')
    robinhood_username = contents[0]
    robinhood_password = contents[1]

with open('robinhood-historical-portfolio.txt') as f:
    historical_values = [x.split(',') for x in f.read().split('\n')[:-1]]

my_trader = Robinhood()
my_trader.login(username=robinhood_username, password=robinhood_password)
equity = my_trader.equity()
now = dt.datetime.now()
now_date = '{}-{}-{}'.format(now.year, '{:02d}'.format(now.month), '{:02d}'.format(now.day))
if historical_values[-1][0] == now_date:
    pass
    # replace old one?
else:
    historical_values.append([now_date, equity])


fig, ax = plt.subplots(figsize = (10, 6))
#plt.figure(facecolor='w',figsize=(10.,6.))
fig.suptitle('Historical Portfolio Value', size='xx-large')

equities = [x[1] for x in historical_values]
dates = [x[0] for x in historical_values]
dates = [dt.datetime.strptime(x, '%Y-%m-%d') for x in dates]
dates = matplotlib.dates.date2num(dates)
curr_value = [equities[-1] for _ in historical_values]
min_value = [max(equities) for _ in historical_values]
max_value = [min(equities) for _ in historical_values]

ax.plot_date(dates, equities, '-', color='#63F6B7', lw=3)
ax.plot_date(dates, curr_value, '-', color='#404040')
ax.plot_date(dates, min_value, '-', color='#808080')
ax.plot_date(dates, max_value, '-', color='#808080')
upper_limit = float(max(equities)) * 1.2
up_offset = upper_limit * .01
down_offset = upper_limit * .05
ax.text(dates[3], float(equities[-1]) - down_offset, 'Current value: ${}'.format(equities[-1]))
ax.text(dates[3], float(max(equities)) + up_offset, 'Maximum value: ${}'.format(max(equities)))
ax.text(dates[3], float(min(equities)) - down_offset, 'Minimum value: ${}'.format(min(equities)))

mondays = mdates.WeekdayLocator(mdates.MONDAY)
months = mdates.MonthLocator()
monthsFmt = mdates.DateFormatter("%b")
ax.xaxis.set_major_locator(months)
ax.xaxis.set_major_formatter(monthsFmt)
ax.xaxis.set_minor_locator(mondays)

ax.set_ylim(0, upper_limit)
for tick in ax.get_xticklabels():
    tick.set_rotation(20)
ax.grid(True)

if True:
    plt.show()
else:
    pylab.savefig('daily_historical_portfolio.png', facecolor='w', edgecolor='w')
    plt.close()

with open('robinhood-historical-portfolio.txt', 'w') as f:
    for row in historical_values:
        f.write('{},{}\n'.format(row[0], row[1]))

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), index=True, unique=True)
    email = db.Column(db.String(120), index=True, unique=True)
    password_hash = db.Column(db.String(128))
    portfolio_ownership = db.Column(db.Float)

    def __repr__(self):
        return '<User {}>'.format(self.username)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

db.create_all()

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Sign In')

class RegistrationForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired()])
    password2 = PasswordField(
        'Repeat Password', validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Register')

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user is not None:
            raise ValidationError('Please use a different username.')

    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user is not None:
            raise ValidationError('Please use a different email address.')

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
        print('here', current_user.email)
        print(d[current_user.email])
        current_user.portfolio_ownership = d[current_user.email]
        db.session.commit()


    stocks_data_dir = par_path + '/capit-vita/data/'
    images = os.listdir(stocks_data_dir)
    today = dt.date.today().strftime('%b %d, %Y')
    portfolio_ownership = current_user.portfolio_ownership
    return render_template('stocks.html', images=images, today=today, portfolio_ownership=portfolio_ownership)

@app.route('/return-files/')
def return_files_tut():
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
        user = User(username=form.username.data, email=form.email.data, portfolio_ownership=0)
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

def myround(x, base=5):
    return int(base * round(float(x)/base))

@app.route('/fitness')
def fitness():

    weight = 183

    calories = myround(weight * 12)
    protein = myround(calories * .27 / 4)
    fat = myround(calories * .33 / 9)
    carbs = myround(calories * .4 / 4)

    calories_refeed = myround(weight * 15)
    protein_refeed = myround(calories_refeed * .25 / 4)
    fat_refeed = myround(calories_refeed * .3 / 9)
    carbs_refeed = myround(calories_refeed * .45 / 4)

    print('For {} lbs, regular day:'.format(weight))
    print('  Calories: {} cal, Protein: {}g, Fat: {}g, Carbs: {}g\n'.format(calories, protein, fat, carbs))

    print('For {} lbs, heavy day:'.format(weight))
    print('  Calories: {} cal, Protein: {}g, Fat: {}g, Carbs: {}g\n'.format(calories_refeed, protein_refeed, fat_refeed, carbs_refeed))


    # lifting goals: decent, good, great, warrior

    ranks = ['Decent', 'Good', 'Great', 'Warrior']
    lifts = {'Incline Bench':['{} for 5 reps'.format(myround(weight * coeff, 5)) for coeff in [1, 1.1, 1.2, 1.3]],
             'Standing Press':['{} for 5 reps'.format(myround(weight * coeff, 5)) for coeff in [0.6, 0.7, 0.8, 0.9]],
             'Weighted Chin-ups':['{} for 5 reps'.format(myround(weight * coeff, 5)) for coeff in [0.2, 0.3, 0.4, 0.5]],
             'Front Squats':['{} for 5 reps'.format(myround(weight * coeff, 5)) for coeff in [1.1, 1.2, 1.3, 1.4]],
             'Bulgarin Split Squats':['{} for 6 reps'.format(myround(weight * coeff, 5)) for coeff in [0.6, 0.7, 0.8, 0.9]],
             'Romanian Deadlifts':['{} for 8 reps'.format(myround(weight * coeff, 5)) for coeff in [1.2, 1.35, 1.5, 1.65]]
            }

    print('Lifting goals:')
    for lift in lifts:
        print('\n{}:'.format(lift))
        for i in range(len(ranks)):
            print('  {}: {} lbs'.format(ranks[i], lifts[lift][i]))

    # phase 1: 8 weeks
    incline_barbell_current = 100
    incline_barbell_sets = [myround(incline_barbell_current * x) for x in [1, 0.9, 0.8]]
    flat_dumbbell_bench_current = 100
    flat_dumbbell_bench_sets = [myround(flat_dumbbell_bench_current * x) for x in [1, 0.9]]
    incline_dumbbell_curls_current = 20
    incline_dumbbell_curls_sets = [myround(incline_dumbbell_curls_current - x) for x in [0, 5, 10]]
    rope_hammer_curls_current = 20
    rope_hammer_curls_sets = [myround(rope_hammer_curls_current * x ) for x in [1, 0.9]]
    bent_over_flyes_current = 20


    print('\n\n--- Workout A --- \n')
    print('Incline barbell warm-up: 6 light reps, 4 medium reps, 2 heavy reps.')
    print('Incline barbell sets: 5-6 reps of {} lbs, 6-7 reps of {} lbs, 7-8 reps of {} lbs. 3 minutes between sets.'.format(incline_barbell_sets[0], incline_barbell_sets[1], incline_barbell_sets[2]))
    print('  Complete [], Mastered []') # mastered = +5 lbs
    print('Flat dumbbell bench: 8-10 reps of {} lbs, 10-12 reps of {} lbs. 3 minutes between sets.'.format(flat_dumbbell_bench_sets[0], flat_dumbbell_bench_sets[1]))
    print('  Complete [], Mastered []') # mastered = +5 lbs
    print('Incline dumbbell curls warm-up: 8 light reps.')
    print('Incline dumbbell curls: 6-8 reps of {} lbs, 6-8 reps of {} lbs, 6-8 reps of {} lbs. 3 minutes between sets.'.format(incline_dumbbell_curls_sets[0], incline_dumbbell_curls_sets[1], incline_dumbbell_curls_sets[2]))
    print('  Complete [], Mastered []') # mastered = +5 lbs
    print('Rope hammer curls: 8-10 reps of {} lbs, 10-12 reps of {} lbs. 3 minutes between sets.'.format(rope_hammer_curls_sets[0], rope_hammer_curls_sets[1]))
    print('  Complete [], Mastered []') # mastered = +5 lbs
    print('Bent over flyes: (@ {} lbs) 12-15 reps, rest 10s, 4-6 reps, rest 10s, 4-6 reps, rest 10s, 4-6 reps.'.format(bent_over_flyes_current))
    print('  Complete [], Mastered []') # mastered = +5 lbs

if __name__ == '__main__':

    if os.getcwd() == r'C:\Users\Takkeezi\Documents\python\takaomattcom\website' or os.getcwd() == '/Users/takaomatt/Documents/python-projects/takaomattcom':
        if RUN_APP:
            app.run()
    else:
        app.run(host='0.0.0.0', port = 80)
