#
# Matt Takao
# 2018-01-16
# last modified 2018-01-21
#

# to-do:
#
# ready to submit!
#

from datetime import datetime

from flask import flash, request, render_template, redirect
from sqlalchemy import or_

from app import app, db
from models import VehicleSale
from tables import Results
from forms import SearchVehicleSalesForm, CreateVehicleSaleForm

db.create_all()


@app.route('/', methods = ['GET', 'POST'])
def index():
    """Homepage: includes search function and a link to create new entries
    """
    search = SearchVehicleSalesForm(request.form)
    if request.method == 'POST':
        return search_results(search)
    return render_template('index.html', form=search)


@app.route('/results/', )
def search_results(search):
    """Search: computes and then redirects to either
    index.html if there are no results (with flashed message), or
    results.html if results are found
    """
    results = []
    search_string = search.data['search']

    if search_string:
        if search.data['select'] == 'VIN':
            results = db.session.query(VehicleSale).filter(
                VehicleSale.vin.contains(search_string)).all()
        elif search.data['select'] == 'Make':
            results = db.session.query(VehicleSale).filter(
                VehicleSale.make.contains(search_string)).all()
        elif search.data['select'] == 'Model':
            results = db.session.query(VehicleSale).filter(
                VehicleSale.model.contains(search_string)).all()
        elif search.data['select'] == 'Year':
            results = db.session.query(VehicleSale).filter(
                VehicleSale.year.contains(search_string)).all()
        elif search.data['select'] == 'Price':
            results = db.session.query(VehicleSale).filter(
                VehicleSale.price.contains(search_string)).all()
        elif search.data['select'] == 'Buyer':
            results = db.session.query(VehicleSale).filter(
                VehicleSale.buyer.contains(search_string)).all()
        elif search.data['select'] == 'Seller':
            results = db.session.query(VehicleSale).filter(
                VehicleSale.seller.contains(search_string)).all()
        elif search.data['select'] == 'Make AND Model (separate with /)':
            search_string = search_string.split('/')
            results = db.session.query(VehicleSale).filter(
                VehicleSale.make.contains(search_string[0])).filter(
                VehicleSale.model.contains(search_string[1])).all()
        elif search.data['select'] == 'Make AND Model AND Year (/)':
            search_string = search_string.split('/')
            results = db.session.query(VehicleSale).filter(
                VehicleSale.make.contains(search_string[0])).filter(
                VehicleSale.model.contains(search_string[1])).filter(
                VehicleSale.year.contains(search_string[2])).all()
        elif search.data['select'] == 'Buyer OR Seller':
            results = db.session.query(VehicleSale).filter(or_(
                VehicleSale.buyer.contains(search_string),
                VehicleSale.seller.contains(search_string))).all()
        else:
            results = db.session.query(VehicleSale).all()

    else: # no search criteria, return all
        results = db.session.query(VehicleSale).all()

    if not results:
        flash('No results found!')
        return redirect('/')
    else:
        table = Results(results)
        table.border = True
        return render_template('results.html', table=table)


@app.route("/create_sale_form/", methods = ['GET', 'POST'])
def create_sale_form():
    """Create sale(s): Redirects to homepage after successful creation
    """
    form = CreateVehicleSaleForm(request.form)

    if request.method == 'POST' and form.validate():
        save_db(form, sale_number = 'new')
        flash('Vehicle sale successfully logged.')
        return redirect('/')

    return render_template('new_vehicle_sale.html', form=form)


def save_db(form, sale_number = 'new'):
    """Save db: Adds or updates a row to the database
    """
    if sale_number == 'new':
        sale = VehicleSale()
    else: # for updating an existing row
        sale = db.session.query(VehicleSale).filter_by(
                sale_number = sale_number).first()
    sale.vin = form.vin.data
    sale.make = form.make.data
    sale.model = form.model.data
    sale.year = form.year.data
    sale.price = form.price.data
    sale.buyer = form.buyer.data
    sale.seller = form.seller.data
    sale.date_of_sale = form.date_of_sale.data

    db.session.add(sale)
    db.session.commit()


@app.route('/uploader', methods = ['GET', 'POST'])
def upload_file():
    """Upload file: for bulk upload
    Could make this more robust to handle different types of files, formats, etc
    """
    if request.method == 'POST':
        f = request.files['file']
        file_contents = f.read()
        for row in file_contents.split('\n'):
            data = row.split(',')
            if data != ['']: # disregard empty rows / space
                sale = VehicleSale()
                sale.vin = data[0]
                sale.make = data[1]
                sale.model = data[2]
                sale.year = data[3]
                sale.price = data[4]
                sale.buyer = data[5]
                sale.seller = data[6]
                sale.date_of_sale = datetime.strptime(data[7][:-1], '%Y-%m-%d')
                db.session.add(sale)
        db.session.commit()
        flash('Vehicle sales successfully logged.')
        return redirect('/')
    else:
        flash('Problem loading file.')
        return redirect('/')


@app.route('/edit/<int:sale_number>/', methods = ['GET', 'POST'])
def edit_sale(sale_number):
    """Edit: edits an entry by sale_number
    If a sale_number exists, provide an editing web form, then update entry
    """
    sale = db.session.query(VehicleSale).filter_by(
            sale_number = sale_number).first()
    if sale:
        form = CreateVehicleSaleForm(formdata = request.form, obj=sale)
        if request.method == 'POST' and form.validate():
            save_db(form, sale_number)
            flash('Sale updated successfully.')
            return redirect('/')
        return render_template('edit_sale.html', form=form)
                # user will arrive at edit_sale.html for GET (first time)
    else:
        flash('No sale #{} in database.'.format(sale_number))
        return redirect('/')


@app.route('/delete/<int:sale_number>/', methods = ['GET', 'POST'])
def delete_sale(sale_number):
    """Delete: deletes an entry by sale_number
    """
    sale = db.session.query(VehicleSale).filter_by(
                sale_number = sale_number).first()
    if sale:
        db.session.delete(sale)
        db.session.commit()
        flash('Sale deleted successfully.')
        return redirect('/')
    else:
        flash('No sale #{} in database.'.format(sale_number))
        return redirect('/')



if __name__ == '__main__':
    app.run()
