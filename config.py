#
# Matt Takao
#

# Set up to connect to database

import os
basedir = os.path.abspath(os.path.dirname(__file__))

SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(basedir, 'database.sqlite')
SQLALCHEMY_MIGRATE_REPO = os.path.join(basedir, 'db_repository')
SQLALCHEMY_TRACK_MODIFICATIONS = False
SECRET_KEY="powerful secretkey"
WTF_CSRF_SECRET_KEY="a csrf secret key"
